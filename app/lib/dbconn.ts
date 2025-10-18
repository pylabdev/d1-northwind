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

import { existsSync } from 'fs';
//import { render } from 'hanji';
import { join, resolve } from 'path';

import type { TypeOf } from 'zod';
import { any, boolean, enum as enum_, literal, object, string, union } from 'zod';

import type { AnySQLiteTable } from 'drizzle-orm/sqlite-core';
import { getTableConfig as sqliteTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';

import type { AnyColumn, AnyTable, TablesRelationalConfig  } from 'drizzle-orm';
import type { MigrationConfig } from 'drizzle-orm/migrator';

import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	is,
	Many,
	normalizeRelation,
	One,
	Relations,

} from 'drizzle-orm';

import { CasingCache, toCamelCase, toSnakeCase } from 'drizzle-orm/casing';




export const casingTypes = ['snake_case', 'camelCase'] as const;
export const casingType = enum_(casingTypes);
export type CasingType = (typeof casingTypes)[number];



type CustomDefault = {
	schema: string;
	table: string;
	column: string;
	func: () => unknown;
};

type SchemaFile = {
	name: string;
	content: string;
};

export type Setup = {
	dbHash: string;
	dialect: 'postgresql' | 'mysql' | 'sqlite' | 'singlestore';
	packageName:
		| '@aws-sdk/client-rds-data'
		| 'pglite'
		| 'pg'
		| 'postgres'
		| '@vercel/postgres'
		| '@neondatabase/serverless'
		| 'gel'
		| 'mysql2'
		| '@planetscale/database'
		| 'd1-http'
		| '@libsql/client'
		| 'better-sqlite3';
	driver?: 'aws-data-api' | 'd1-http' | 'turso' | 'pglite';
	databaseName?: string; // for planetscale (driver remove database name from connection string)
	proxy: Proxy;
	transactionProxy: TransactionProxy;
	customDefaults: CustomDefault[];
	schema: Record<string, Record<string, AnyTable<any>>>;
	relations: Record<string, Relations>;
	casing?: CasingType;
	schemaFiles?: SchemaFile[];
};


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

export const safeRegister = async () => {
    const { register } = await import('esbuild-register/dist/node');
    let res: { unregister: () => void };
    try {
        res = register({
            format: 'cjs',
            loader: 'ts',
        });
    } catch {
        // tsx fallback
        res = {
            unregister: () => {},
        };
    }

    // has to be outside try catch to be able to run with tsx
   // await assertES5(res.unregister);
    return res;
};

export const dialects = ['postgresql', 'mysql', 'sqlite', 'turso', 'singlestore', 'gel'] as const;
export const dialect = enum_(dialects);

export const prefixes = [
	'index',
	'timestamp',
	'supabase',
	'unix',
	'none',
] as const;

export const prefix = enum_(prefixes);
export type Prefix = (typeof prefixes)[number];


export const sqliteDriversLiterals = [
	literal('d1-http'),
	literal('expo'),
	literal('durable-sqlite'),
] as const;

export const postgresqlDriversLiterals = [
	literal('aws-data-api'),
	literal('pglite'),
] as const;


// export const drivers = ['d1-http', 'expo', 'aws-data-api', 'pglite', 'durable-sqlite'] as const;
// export type Driver = (typeof drivers)[number];
// const _: Driver = '' as TypeOf<typeof driver>;

export const sqliteDriver = union(sqliteDriversLiterals);
export const postgresDriver = union(postgresqlDriversLiterals);
export const driver = union([sqliteDriver, postgresDriver]);

export const configMigrations = object({
	table: string().optional(),
	schema: string().optional(),
	prefix: prefix.optional().default('index'),
}).optional();

export const configCommonSchema = object({
    dialect: dialect,
    schema: union([string(), string().array()]).optional(),
    out: string().optional(),
    breakpoints: boolean().optional().default(true),
    verbose: boolean().optional().default(false),
    driver: driver.optional(),
    tablesFilter: union([string(), string().array()]).optional(),
    schemaFilter: union([string(), string().array()]).default(['public']),
    migrations: configMigrations,
    dbCredentials: any().optional(),
    casing: casingType.optional(),
    sql: boolean().default(true),
}).passthrough();

export const studioConfig = object({
	dialect,
	schema: union([string(), string().array()]).optional(),
	casing: casingType.optional(),
});


export type CliConfig = TypeOf<typeof configCommonSchema>;

export function assertUnreachable(x: never | undefined): never {
	throw new Error("Didn't expect to get here");
}

// don't fail in runtime, types only
export function softAssertUnreachable(x: never) {
	return null as never;
}

export function getColumnCasing(
	column: { keyAsName: boolean; name: string | undefined },
	casing: CasingType | undefined,
) {
	if (!column.name) return '';
	return !column.keyAsName || casing === undefined
		? column.name
		: casing === 'camelCase'
		? toCamelCase(column.name)
		: toSnakeCase(column.name);
}



export const drizzleConfigFromFile = async (
	configPath?: string,
	isExport?: boolean,
): Promise<CliConfig> => {
	const prefix = process.env.TEST_CONFIG_PATH_PREFIX || '';

	const defaultTsConfigExists = existsSync(resolve(join(prefix, 'drizzle.config.ts')));
	const defaultJsConfigExists = existsSync(resolve(join(prefix, 'drizzle.config.js')));
	const defaultJsonConfigExists = existsSync(
		join(resolve('drizzle.config.json')),
	);

	const defaultConfigPath = defaultTsConfigExists
		? 'drizzle.config.ts'
		: defaultJsConfigExists
		? 'drizzle.config.js'
		: 'drizzle.config.json';

	if (!configPath && !isExport) {
		console.log(' no config ');
	}

	const path: string = resolve(join(prefix, configPath ?? defaultConfigPath));

	if (!existsSync(path)) {
		console.log(`${path} file does not exist`);
		process.exit(1);
	}


	const { unregister } = await safeRegister();
	const required = require(`${path}`);
	const content = required.default ?? required;
	unregister();

	// --- get response and then check by each dialect independently
	const res = configCommonSchema.safeParse(content);
	if (!res.success) {
		console.log(res.error);
		if (!('dialect' in content)) {
			//console.log(error("Please specify 'dialect' param in config file"));
		}
		process.exit(1);
	}

	return res.data;
};


const getCustomDefaults = <T extends AnyTable<{}>>(
	schema: Record<string, Record<string, T>>,
	casing?: CasingType,
): CustomDefault[] => {
	const customDefaults: CustomDefault[] = [];

	Object.entries(schema).map(([schema, tables]) => {
		Object.entries(tables).map(([, table]) => {
			let tableConfig: {
				name: string;
				columns: AnyColumn[];
			};
            if (is(table, SQLiteTable)) {
				tableConfig = sqliteTableConfig(table);
            } else {
                tableConfig = sqliteTableConfig(table);
            }

			// if (is(table, PgTable)) {
			// 	//tableConfig = pgTableConfig(table);
			// } else if (is(table, MySqlTable)) {
			// 	//tableConfig = mysqlTableConfig(table);
			// } else if (is(table, SQLiteTable)) {
			// 	tableConfig = sqliteTableConfig(table);
			// } else {
			// 	//tableConfig = singlestoreTableConfig(table);
			// }

			tableConfig.columns.map((column) => {
				if (column.defaultFn) {
					customDefaults.push({
						schema,
						table: tableConfig.name,
						column: getColumnCasing(column, casing),
						func: column.defaultFn,
					});
				}
			});
		});
	});

	return customDefaults;
};


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

			//return Buffer.from(value);
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

export const flattenDatabaseCredentials = (config: any) => {
	if ('dbCredentials' in config) {
		const { dbCredentials, ...rest } = config;
		return {
			...rest,
			...dbCredentials,
		};
	}
	return config;
};

export const prepareStudioConfig = async (options: Record<string, unknown>) => {

	const config = await drizzleConfigFromFile();
	const result = studioConfig.safeParse(config);


	if (!('dbCredentials' in config)) {
		//console.log(outputs.studio.noCredentials());
		process.exit(1);
	}

	const { host, port } = options;
	const { dialect, schema, casing } = config;
	const flattened = flattenDatabaseCredentials(config);


	if (dialect === 'sqlite') {
		const parsed = flattened; // sqliteCredentials.safeParse(flattened);
		if (!parsed.success) {
		//	printIssuesSqlite(flattened as Record<string, unknown>, 'studio');
			process.exit(1);
		}
		const credentials = flattened; //parsed.data;
		return {
			dialect,
			schema,
			host,
			port,
			credentials,
			casing,
		};
	}


	//assertUnreachable(dialect);
};


export const drizzleForSQLite = async (
	credentials: SqliteCredentials,
	sqliteSchema: Record<string, Record<string, AnySQLiteTable>>,
	relations: Record<string, Relations>,
	schemaFiles?: SchemaFile[],
	casing?: CasingType,
): Promise<Setup> => {
	//const { connectToSQLite } = await import('../cli/connections');

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


