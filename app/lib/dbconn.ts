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


