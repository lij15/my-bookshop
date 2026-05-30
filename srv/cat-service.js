const cds = require('@sap/cds')

module.exports = class CatalogService extends cds.ApplicationService{
    async init(){
        const{Books,Orders} = this.entities

        // BEFORE: Gatekeeper — Executes before database operations
        // Purpose: Authentication, permission checks, modifying requested data
        this.before('CREATE',Orders,async req => {
            console.log('before create orders begin');
            const{book_ID,amount} = req.data

            if(!amount || amount <= 0){
                return req.error(400,'The quantity purchased must be greater than 0.')
            }

            const book = await SELECT.one.from(Books).where({ID:book_ID})

            if(!book){
                return req.error(404,`The book with ID ${book_ID} cannot be found.`)
            }
            
            console.log(`book stock:${book.stock}`);
            console.log(`amount:${amount}`);
            if(book.stock < amount){
                return req.error(409,`Low stock! Current stock: ${book.stock}, Required: ${amount}`)
            }
            console.log('before create orders end');
        })

        this.after('CREATE',Orders,async req => {
            console.log('after create orders');
        })

        // ON: Worker — Replaces the default CRUD processing logic
        // Purpose: To customize actions/functions, or to completely override a CRUD operation
        this.on('submitOrder', async req => {
            const{bookID,amount} = req.data

            const book = await SELECT.one.from(Books).where({ID:bookID})
            if(!book) return req.error(404,'method on:book does not exist')
            if(book.stock < amount) return req.error(409,'Insufficient stock')
            
            await UPDATE(Books)
                .set({stock:book.stock - amount})
                .where({ID:bookID})

            //orderレコードを作成
            //const orderID = Match.floor(Match.random() * 100000)
            await INSERT.into(Orders).entries({
                ID:4134052,
                book_ID:bookID,
                amount:amount
            })
            return{
                message:'Order placed successfully!'
            }
        })

        // AFTER: Quality Inspection — Executed after database read
        // Purpose: Processing returned data, adding calculated fields, sending emails, etc.
        this.after('READ',Books,books => {
            const discount = 0.9
            const list = Array.isArray(books) ? books : [books]

            for(const book of list){
                if(book.price != null){
                    book.discountPrice = +(book.price * discount).toFixed(2)
                    book.discountLabel = `10% discount: ${book.discountPrice}`
                }
            }
        })

        // You must call super.init() to register the framework's generic handlers
        return super.init()
    }

}