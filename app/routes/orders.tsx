import {Link, useNavigate} from "react-router";
import {prepareStatements, createSQLLog} from "~/lib/utils";
import {Paginate} from "~/components";

//import { default as d1config} from "../../drizzle.config"

import {drizzle} from 'drizzle-orm/d1';
//import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import {Order as order_table} from '../db/schema';
import type {Route} from "./+types/orders";
import {useStatsDispatch} from "~/components/StatsContext";
import {useEffect} from "react";

export interface Order {
    Id: string;
    TotalProducts: string;
    TotalProductsPrice: string;
    TotalProductsItems: string;
    OrderDate: string;
    ShipName: string;
    ShipCity: string;
    ShipCountry: string;
}

/* CREATE TABLE IF NOT EXISTS "Order" ( "Id" INTEGER PRIMARY KEY, "CustomerId" VARCHAR(8000) NULL, "EmployeeId" INTEGER NOT NULL, "OrderDate" VARCHAR(8000) NULL, "RequiredDate" VARCHAR(8000) NULL, "ShippedDate" VARCHAR(8000) NULL, "ShipVia" INTEGER NULL, "Freight" DECIMAL NOT NULL, "ShipName" VARCHAR(8000) NULL, "ShipAddress" VARCHAR(8000) NULL, "ShipCity" VARCHAR(8000) NULL, "ShipRegion" VARCHAR(8000) NULL, "ShipPostalCode" VARCHAR(8000) NULL, "ShipCountry" VARCHAR(8000) NULL);
*/

//

export async function loader({context, request}: Route.LoaderArgs) {
    const session = context.cloudflare.env.DB.withSession("first-unconstrained");
    const {searchParams} = new URL(request.url);
    const count = true;
    const page = parseInt(searchParams.get("page") as string) || 1;
    const itemsPerPage = 20;

    const db = drizzle(context.cloudflare.env.DB);
   // const db = drizzle(d1config);

    const result = await db.select().from(order_table).all()

    const [stmts, sql] = prepareStatements(
        session,
        count ? '"Order"' : false,
        [
            'SELECT SUM(OrderDetail.UnitPrice * OrderDetail.Discount * OrderDetail.Quantity) AS TotalProductsDiscount, SUM(OrderDetail.UnitPrice * OrderDetail.Quantity) AS TotalProductsPrice, SUM(OrderDetail.Quantity) AS TotalProductsItems, COUNT(OrderDetail.OrderId) AS TotalProducts, "Order".Id, CustomerId, EmployeeId, OrderDate, RequiredDate, ShippedDate, ShipVia, Freight, ShipName, ShipAddress, ShipCity, ShipRegion, ShipPostalCode, ShipCountry, ProductId FROM "Order", OrderDetail WHERE OrderDetail.OrderId = "Order".Id GROUP BY "Order".Id LIMIT ?1 OFFSET ?2',
        ],
        [[itemsPerPage, (page - 1) * itemsPerPage]]
    );

    try {
        const startTime = Date.now();
        const response: D1Result<any>[] = await session.batch(
            stmts as D1PreparedStatement[]
        );
        const overallTimeMs = Date.now() - startTime;

        const first = response[0];
        const total = count && first.results ? (first.results[0] as any).total : 0;

        const orders: any = count
            ? response.slice(1)[0].results
            : response[0].results;

        return {
            page: page,
            pages: count ? Math.ceil(total / itemsPerPage) : 0,
            items: itemsPerPage,
            total: count ? total : 0,
            stats: {
                queries: stmts.length,
                results: orders.length + (count ? 1 : 0),
                select: stmts.length,
                overallTimeMs: overallTimeMs,
                log: createSQLLog(sql, response, overallTimeMs),
            },
            orders: orders,
            tmpData: result,
        };
    } catch (e: any) {
        return {error: 404, msg: e.toString()};
    }
}

export default function Orders({loaderData}: Route.ComponentProps) {
    const navigate = useNavigate();
    console.log({loaderData});
    const {orders, page, pages, stats, tmpData} = loaderData;
    const dispatch = useStatsDispatch();

    useEffect(() => {
        dispatch && stats && dispatch(stats);
    }, [dispatch, stats]);

    const setPage = (page: number) => {
        navigate(`/orders?page=${page}`);
    };

    return (
        <>
            {orders.length ? (
                <div className="card has-table">
                    <header className="card-header">
                        <p className="card-header-title">Orders</p>
                        <button className="card-header-icon">
              <span
                  className="material-icons"
                  onClick={() => {
                      //eslint-disable-next-line
                      window.location.href = window.location.href;
                  }}
              >
                redo
              </span>
                        </button>
                    </header>
                    <div className="card-content">
                        <table>
                            <thead>
                            <tr>
                                <th>Id</th>
                                <th>Total Price</th>
                                <th>Products</th>
                                <th>Quantity</th>
                                <th>Shipped</th>
                                <th>Ship Name</th>
                                <th>City</th>
                                <th>Country</th>
                                <th></th>
                            </tr>
                            </thead>
                            <tbody>
                            {orders.map((order: Order, index: number) => {
                                return (
                                    <tr key={index}>
                                        <td data-label="Id">
                                            <Link className="link" to={`/order/${order.Id}`}>
                                                {order.Id}
                                            </Link>
                                        </td>
                                        <td data-label="Price">{`$${parseFloat(
                                            order.TotalProductsPrice
                                        ).toFixed(2)}`}</td>
                                        <td data-label="Products">{order.TotalProducts}</td>
                                        <td data-label="Quantity">{order.TotalProductsItems}</td>
                                        <td data-label="Date">{order.OrderDate}</td>
                                        <td data-label="Name">{order.ShipName}</td>
                                        <td data-label="City">{order.ShipCity}</td>
                                        <td data-label="Country">{order.ShipCountry}</td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                        <Paginate pages={pages!} page={page!} setPage={setPage}/>
                    </div>
                    <div className="card-content">
                        <table>
                            <thead>
                            <tr>
                                <th>Id</th>
                                <th>Total Price</th>
                                <th>Products</th>
                                <th>Quantity</th>
                                <th>Shipped</th>
                                <th>Ship Name</th>
                                <th>City</th>
                                <th>Country</th>
                                <th></th>
                            </tr>
                            </thead>
                            <tbody>
                            {tmpData.map((tmpitem, index: number) => {
                                return (
                                    <tr key={index}>
                                        <td data-label="Id">
                                            <Link className="link" to={`/order/${tmpitem.Id}`}>
                                                {tmpitem.Id}
                                            </Link>
                                        </td>
                                        {/*<td data-label="Price">{`$${parseFloat(*/}
                                        {/*    tmpitem.TotalProductsPrice*/}
                                        {/*).toFixed(2)}`}</td>*/}
                                        <td data-label="Products">{tmpitem.CustomerId}</td>
                                        <td data-label="Quantity">{tmpitem.EmployeeId}</td>
                                        {/*<td data-label="Date">{order.OrderDate}</td>*/}

                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                        <Paginate pages={pages!} page={page!} setPage={setPage}/>
                    </div>
                </div>
            ) : (
                <div className="card-content">
                    <h2>Loading orders...</h2>
                </div>
            )}
        </>
    );
}
