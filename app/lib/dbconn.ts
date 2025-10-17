/* 
export const sqliteCredentials = union([
    object({
        driver: literal('turso'),
        url: string().min(1),
        authToken: string().min(1).optional(),
    }),
    object({
        driver: literal('d1-http'),
        accountId: string().min(1),
        databaseId: string().min(1),
        token: string().min(1),
    }),
    object({
        driver: undefined(),
        url: string().min(1),
    }).transform<{ url: string }>((o) => {
        delete o.driver;
        return o;
    }),
]); */

export type ProxyParams = {
	sql: string;
	params?: any[];
	typings?: any[];
	mode: 'array' | 'object';
	method: 'values' | 'get' | 'all' | 'run' | 'execute';
};


export type Proxy = (params: ProxyParams) => Promise<any[]>;

export type TransactionProxy = (queries: { sql: string; method?: ProxyParams['method'] }[]) => Promise<any[]>;

export type DB = {
	query: <T extends any = any>(sql: string, params?: any[]) => Promise<T[]>;
};

export type SQLiteDB = {
	query: <T extends any = any>(sql: string, params?: any[]) => Promise<T[]>;
	run(query: string): Promise<void>;
};

export type LibSQLDB = {
	query: <T extends any = any>(sql: string, params?: any[]) => Promise<T[]>;
	run(query: string): Promise<void>;
	batchWithPragma?(queries: string[]): Promise<void>;
};

export type SqliteCredentials =
    | {
        driver: 'd1-http';
        accountId: string;
        databaseId: string;
        token: string;
    }
    | {
        url: string;
    };  


export function assertUnreachable(x: never | undefined): never {
	throw new Error("Didn't expect to get here");
}

// don't fail in runtime, types only
export function softAssertUnreachable(x: never) {
	return null as never;
}


const prepareSqliteParams = (params: any[], driver?: string) => {
	return params.map((param) => {
		if (
			param
			&& typeof param === 'object'
			&& 'type' in param
			&& 'value' in param
			&& param.type === 'binary'
		) {
			const value = typeof param.value === 'object'
				? JSON.stringify(param.value)
				: (param.value as string);

			if (driver === 'd1-http') {
				return value;
			}

			return Buffer.from(value);
		}
		return param;
	});
};



export const connectToSQLite = async (
    credentials: SqliteCredentials,
): Promise< 
    & SQLiteDB
    & {
        packageName: 'd1-http';
        migrate: (config: MigrationConfig) => Promise<void>;
        proxy: Proxy;
        transactionProxy: TransactionProxy;
    }
> => {
    if ('driver' in credentials) {
        const { driver } = credentials;
        if (driver === 'd1-http') {
            const { drizzle } = await import('drizzle-orm/sqlite-proxy');
            const { migrate } = await import('drizzle-orm/sqlite-proxy/migrator');

            type D1Response =
                | {
                    success: true;
                    result: {
                        results:
                        | any[]
                        | {
                            columns: string[];
                            rows: any[][];
                        };
                    }[];
                }
                | {
                    success: false;
                    errors: { code: number; message: string }[];
                };

            const remoteCallback: Parameters<typeof drizzle>[0] = async (
                sql,
                params,
                method,
            ) => {
                const res = await fetch(
                    `https://api.cloudflare.com/client/v4/accounts/${credentials.accountId}/d1/database/${credentials.databaseId}/${method === 'values' ? 'raw' : 'query'
                    }`,
                    {
                        method: 'POST',
                        body: JSON.stringify({ sql, params }),
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${credentials.token}`,
                        },
                    },
                );

                const data = (await res.json()) as D1Response;

                if (!data.success) {
                    throw new Error(
                        data.errors.map((it) => `${it.code}: ${it.message}`).join('\n'),
                    );
                }

                const result = data.result[0].results;
                const rows = Array.isArray(result) ? result : result.rows;

                return {
                    rows,
                };
            };

            const remoteBatchCallback = async (
                queries: {
                    sql: string;
                }[],
            ) => {
                const sql = queries.map((q) => q.sql).join('; ');
                const res = await fetch(
                    `https://api.cloudflare.com/client/v4/accounts/${credentials.accountId}/d1/database/${credentials.databaseId}/query`,
                    {
                        method: 'POST',
                        body: JSON.stringify({ sql }),
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${credentials.token}`,
                        },
                    },
                );

                const data = (await res.json()) as D1Response;

                if (!data.success) {
                    throw new Error(
                        data.errors.map((it) => `${it.code}: ${it.message}`).join('\n'),
                    );
                }

                const rows = data.result.map((result) => {
                    const res = result.results;
                    return Array.isArray(res) ? res : res.rows;
                });

                return {
                    rows,
                };
            };

            const drzl = drizzle(remoteCallback);
            const migrateFn = async (config: MigrationConfig) => {
                return migrate(
                    drzl,
                    async (queries) => {
                        for (const query of queries) {
                            await remoteCallback(query, [], 'run');
                        }
                    },
                    config,
                );
            };

            const db: SQLiteDB = {
                query: async <T>(sql: string, params?: any[]) => {
                    const res = await remoteCallback(sql, params || [], 'all');
                    return res.rows as T[];
                },
                run: async (query: string) => {
                    await remoteCallback(query, [], 'run');
                },
            };
            const proxy: Proxy = async (params) => {
                const preparedParams = prepareSqliteParams(params.params || [], 'd1-http');
                const result = await remoteCallback(
                    params.sql,
                    preparedParams,
                    params.mode === 'array' ? 'values' : 'all',
                );

                return result.rows;
            };
            const transactionProxy: TransactionProxy = async (queries) => {
                const result = await remoteBatchCallback(queries);
                return result.rows;
            };

            return { ...db, packageName: 'd1-http', proxy, transactionProxy, migrate: migrateFn };
        } else {
            assertUnreachable(driver);
        }
    } else {
        return {};
    }

 



    process.exit(1);
};


export const drizzleForSQLite = async (
	credentials: SqliteCredentials,
	sqliteSchema: Record<string, Record<string, AnySQLiteTable>>,
	relations: Record<string, Relations>,
	schemaFiles?: SchemaFile[],
	casing?: CasingType,
): Promise<Setup> => {
	const { connectToSQLite } = await import('../cli/connections');

	const sqliteDB = await connectToSQLite(credentials);
	const customDefaults = getCustomDefaults(sqliteSchema, casing);

	let dbUrl: string;

	if ('driver' in credentials) {
		const { driver } = credentials;
		if (driver === 'd1-http') {
			dbUrl = `d1-http://${credentials.accountId}/${credentials.databaseId}/${credentials.token}`;
		} else {
			assertUnreachable(driver);
		}
	} else {
		dbUrl = credentials.url;
	}

	const dbHash = createHash('sha256').update(dbUrl).digest('hex');

	return {
		dbHash,
		dialect: 'sqlite',
		driver: 'driver' in credentials ? credentials.driver : undefined,
		packageName: sqliteDB.packageName,
		proxy: sqliteDB.proxy,
		transactionProxy: sqliteDB.transactionProxy,
		customDefaults,
		schema: sqliteSchema,
		relations,
		schemaFiles,
		casing,
	};
};


