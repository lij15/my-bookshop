namespace my.bookshop;

entity Books {
    key ID      :   Integer;
        title   :   String;
        stock   :   Integer;
        price   :   Decimal(9, 2);
}

entity Order {
    key ID      :   Integer;
        book    :   Association to Books;
        amount  :   Integer;
}