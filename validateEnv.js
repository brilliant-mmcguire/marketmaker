require('dotenv').config();

function validateEnv() {
  if (!process.env.API_KEY) {
    console.error("Error: The .env file must contain an 'API_KEY' variable.");
    process.exit(1); // Exit with a failure code
  } else {
    console.log(`Success: .env contains a ${process.env.API_KEY.length} character 'API_KEY' variable.`);
  }

  if (!process.env.API_SECRET) {
    console.error("Error: The .env file must contain an 'API_SECRET' variable.");
    process.exit(1); // Exit with a failure code
  } else {
    console.log(`Success: .env contains a ${process.env.API_SECRET.length} character 'API_SECRET' variable.`);
  }
}

validateEnv();