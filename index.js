const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const cors = require('cors');
const app = express();
const jwt = require('jsonwebtoken');
const stripe = require("stripe")(process.env.STRIPE_ST);

// use middleware 
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 5000;

// MongoDB Client Connect
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PWD}@cluster0.qft8n.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
   const authHeader = req.headers.authorization;
   if (!authHeader) {
      return res.status(401).send({ message: 'UnAuthorized Access' });
   }
   const token = authHeader.split(' ')[1];
   jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
      if (err) {
         return res.status(403).send({ message: 'Forbidden Access' })
      }
      req.decoded = decoded;
      next();
   });
}

// Running Api From Here
async function run() {
   try {
      await client.connect();

      // Database Name and Collection Name
      const productCollection = client.db('manufacture').collection('products');
      const usersCollection = client.db('manufacture').collection('users');
      const reviewsCollection = client.db('manufacture').collection('reviews');
      const ordersCollection = client.db('manufacture').collection('orders');

      // portfolio collection
      const infoCollection = client.db('portfolio').collection('information');
      const projectCollection = client.db('portfolio').collection('projects');

      // blog collection
      const blogCollection = client.db('blogs').collection('blog');


      // verify admin function to check user role
      const verifyAdmin = async (req, res, next) => {
         const requester = req.decoded.email;
         const requesterAccount = await usersCollection.findOne({ email: requester });
         if (requesterAccount.role === 'admin') {
            next();
         }
         else {
            res.status(403).send({ message: 'Forbidden' });
         }
      }

      // payment intent
      app.post("/create-payment-intent", verifyJWT, async (req, res) => {
         const { total_price } = req.body;
         let amount = parseInt(total_price) * 100;
         // Create a PaymentIntent with the order amount and currency
         const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: "usd",
            payment_method_types: ['card']
         });

         res.send({
            clientSecret: paymentIntent.client_secret,
         });
      });


      // checking admin role
      app.get('/admin/:email', async (req, res) => {
         const email = req.params.email;
         const user = await usersCollection.findOne({ email: email });
         const isAdmin = user.role === 'admin';
         res.send({ admin: isAdmin })
      });

      // set admin
      app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
         const email = req.params.email;
         const filter = { email: email };
         const option = { upsert: true };
         const setRole = {
            $set: { role: 'admin' },
         };
         const result = await usersCollection.updateOne(filter, setRole, option);
         res.send(result);
      })


      // Set user into database with authentication
      app.put('/user/:email', async (req, res) => {
         const email = req.params.email;
         const user = req.body;
         const filter = { email: email };
         const options = { upsert: true };
         const updateDoc = {
            $set: user,
         };
         const result = await usersCollection.updateOne(filter, updateDoc, options);
         const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
         res.send({ result, token });
      });

      // Fetching User information
      app.get('/user-info/:email', async (req, res) => {
         const email = req.params.email;
         const query = { email: email };
         const result = await usersCollection.findOne(query);
         res.send(result);
      });

      // fetch all the users list
      app.get('/users', async (req, res) => {
         const result = (await usersCollection.find({}).toArray()).reverse();
         res.send(result);
      });

      // fetch all the products
      app.get('/products', async (req, res) => {
         const cursor = await productCollection.find({}).toArray();
         res.send(cursor);
      });

      // Fetch single product
      app.get('/products/:id', async (req, res) => {
         const id = req.params.id;
         const query = {
            _id: ObjectId(id)
         }
         const result = await productCollection.findOne(query);
         res.send(result);
      });

      // insert product
      app.post('/product/', async (req, res) => {
         const body = req.body;
         const result = await productCollection.insertOne(body);
         res.send(result);
      });

      // update product by product id api
      app.put('/product-update/:id', async (req, res) => {
         const id = req.params.id;
         const body = req.body;
         const filterProduct = { _id: ObjectId(id) };
         const option = { upsert: true };
         const data = {
            $set: body
         }
         const result = await productCollection.updateOne(filterProduct, data, option);
         res.send(result);
      });

      // delete product api
      app.delete('/delete-product/:id', async (req, res) => {
         const id = req.params.id;
         const filterProduct = { _id: ObjectId(id) };
         res.send(await productCollection.deleteOne(filterProduct));
      });

      // Add review api
      app.post('/reviews', async (req, res) => {
         const data = req.body;
         const result = await reviewsCollection.insertOne(data);
         res.send(result);
      });

      // fetch all review
      app.get('/reviews', async (req, res) => {
         const result = await reviewsCollection.find({}).toArray();
         res.send(result);
      });

      // fetch review by one particular user
      app.get('/review/:email', async (req, res) => {
         const email = req.params.email;
         const result = (await reviewsCollection.find({ email: email }).toArray()).reverse();
         res.send(result);
      });

      // fetch review by particular user
      app.delete('/review/:id', async (req, res) => {
         const id = req.params.id;
         const result = await reviewsCollection.deleteOne({ _id: ObjectId(id) });
         res.send(result);
      });

      // make order for user
      app.post('/orders/:id', async (req, res) => {
         const id = req.params.id;
         const data = req.body;
         const orderResult = await ordersCollection.insertOne(data);
         res.send(orderResult);
      });

      // update product quantity and order status
      app.put('/order-confirm/:orderId', async (req, res) => {
         const orderId = req.params.orderId;
         const { product_id, order_quantity } = req.body;
         const option = { upsert: true };
         const orderFilter = { _id: ObjectId(orderId) };
         const upOrder = {
            $set: {
               status: "shipped"
            }
         }
         const updateOrder = await ordersCollection.updateOne(orderFilter, upOrder, option);
         // changing product quantity
         const productFilter = { _id: ObjectId(product_id) };
         const product = await productCollection.findOne(productFilter);
         const productQuantity = parseInt(product?.quantity);
         const quantity = productQuantity - parseInt(order_quantity);
         let availability;
         if (quantity < parseInt(product?.min_order_quantity)) {
            availability = 'Out Of Stock';
         } else {
            availability = 'In stock!';
         }
         const upProduct = {
            $set: { quantity: quantity, availability: availability }
         };
         const updateProduct = await productCollection.updateOne(productFilter, upProduct, option);

         res.send({ updateOrder, updateProduct });
      });

      // fetch orders in my order page
      app.get('/my-orders/:email', async (req, res) => {
         const email = req.params.email;
         const filter = {
            email: email
         }
         const result = await ordersCollection.find(filter).toArray();
         res.send(result);
      });

      // delete or cancel order from my-order
      app.delete('/delete-my-order/:orderId', async (req, res) => {
         const orderId = req.params.orderId;
         const result = await ordersCollection.deleteOne({ _id: ObjectId(orderId) });
         res.send(result);
      });

      // all orders for admin role
      app.get('/all-orders', async (req, res) => {
         const result = await ordersCollection.find({}).toArray();
         res.send(result);
      });

      // specific order
      app.get('/order/:id', async (req, res) => {
         const id = req.params.id;
         const result = await ordersCollection.findOne({ _id: ObjectId(id) });
         res.send(result);
      })

      // success payment order
      app.put('/order-payment/:orderId', async (req, res) => {
         const orderId = req.params.orderId;
         const { TxId } = req.body;
         const filterOrderQuery = { _id: ObjectId(orderId) }
         const option = { upsert: true };
         const updateContent = {
            $set: {
               payment: 'paid',
               TxId: TxId
            }
         }
         const result = await ordersCollection.updateOne(filterOrderQuery, updateContent, option)
         res.send(result);
      });

      // Portfolio Api
      app.get('/information', async (req, res) => {
         res.send(await infoCollection.findOne({}));
      });
      // fetch all project
      app.get('/my-project', async (req, res) => {
         res.send(await projectCollection.find({}).toArray());
      })

      // fetch blog
      app.get('/blogs', async (req, res) => {
         res.send(await blogCollection.find({}).toArray());
      })

   } finally {

   }
}
run().catch(console.dir());

app.get('/', (req, res) => {
   res.send('Manufacture Site Running');
});

app.listen(port, () => {
   console.log('Server running in ' + port);
})