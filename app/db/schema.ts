import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
});

export const Order  = sqliteTable('Order', {
    Id: integer('Id').primaryKey({ autoIncrement: true }),
    CustomerId: text('CustomerId'), //.notNull(),
    EmployeeId: integer('EmployeeId').notNull(),
});

export const OrderDetail  = sqliteTable('OrderDetail', {
    Id: text('Id').primaryKey(), //.notNull(),
    OrderId: integer('OrderId'),
    CustomerId: text('CustomerId'), //.notNull(),
    EmployeeId: integer('EmployeeId').notNull(),
});
// "Order" ( "Id" INTEGER PRIMARY KEY, "CustomerId" VARCHAR(8000) NULL, "EmployeeId" INTEGER NOT NULL, "OrderDate" VARCHAR(8000) NULL, "RequiredDate" VARCHAR(8000) NULL, "ShippedDate" VARCHAR(8000) NULL, "ShipVia" INTEGER NULL, "Freight" DECIMAL NOT NULL, "ShipName" VARCHAR(8000) NULL, "ShipAddress" VARCHAR(8000) NULL, "ShipCity" VARCHAR(8000) NULL, "ShipRegion" VARCHAR(8000) NULL, "ShipPostalCode" VARCHAR(8000) NULL, "ShipCountry" VARCHAR(8000) NULL);
// CREATE TABLE IF NOT EXISTS

//CREATE TABLE IF NOT EXISTS "Order" ( "Id" INTEGER PRIMARY KEY, "CustomerId" VARCHAR(8000) NULL, "EmployeeId" INTEGER NOT NULL, "OrderDate" VARCHAR(8000) NULL, "RequiredDate" VARCHAR(8000) NULL, "ShippedDate" VARCHAR(8000) NULL, "ShipVia" INTEGER NULL, "Freight" DECIMAL NOT NULL, "ShipName" VARCHAR(8000) NULL, "ShipAddress" VARCHAR(8000) NULL, "ShipCity" VARCHAR(8000) NULL, "ShipRegion" VARCHAR(8000) NULL, "ShipPostalCode" VARCHAR(8000) NULL, "ShipCountry" VARCHAR(8000) NULL);
// CREATE TABLE IF NOT EXISTS "Product" ( "Id" INTEGER PRIMARY KEY, "ProductName" VARCHAR(8000) NULL, "SupplierId" INTEGER NOT NULL, "CategoryId" INTEGER NOT NULL, "QuantityPerUnit" VARCHAR(8000) NULL, "UnitPrice" DECIMAL NOT NULL, "UnitsInStock" INTEGER NOT NULL, "UnitsOnOrder" INTEGER NOT NULL, "ReorderLevel" INTEGER NOT NULL, "Discontinued" INTEGER NOT NULL);
//CREATE TABLE IF NOT EXISTS "OrderDetail" ( "Id" VARCHAR(8000) PRIMARY KEY, "OrderId" INTEGER NOT NULL, "ProductId" INTEGER NOT NULL, "UnitPrice" DECIMAL NOT NULL, "Quantity" INTEGER NOT NULL, "Discount" DOUBLE NOT NULL);
