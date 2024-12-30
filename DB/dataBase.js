const Mongoose = require("mongoose")

// Modify your MongoDB connection
const connectDB = Mongoose.connect('mongodb+srv://shahalaahammedh7:WAItNsetP48BajNZ@dawcosmetics.5bxl3.mongodb.net/DawCosmetics?retryWrites=true&w=majority&ssl=true', {
  // Remove transaction-related configurations for local development
  useNewUrlParser: true,
  useUnifiedTopology: true,
  // Remove any transaction-related options
});

connectDB
    .then(()=>console.log("Database Connected"))
    .catch((err)=>console.log(err.message))
    







