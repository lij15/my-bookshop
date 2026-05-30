using { my.bookshop as db } from '../db/schema';

service CatalogService {
    entity Books as projection on db.Books;
        //excluding { stock };
    entity Orders as projection on db.Order;
    
    action submitOrder(bookID:Integer,amount:Integer)
        returns {message:String};
}