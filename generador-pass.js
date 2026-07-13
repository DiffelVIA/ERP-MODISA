const bcrypt = require('bcrypt');

const passwordPrueba = 'modisa123'; 

bcrypt.hash(passwordPrueba, 10)
  .then(hash => {
    console.log("\n========================================================");
    console.log(`🔑 Contraseña limpia: ${passwordPrueba}`);
    console.log(`🔒 Copia este HASH exacto en tu campo 'password' de MySQL:`);
    console.log("========================================================");
    console.log(hash);
    console.log("========================================================\n");
  })
  .catch(err => console.error("❌ Error al cifrar:", err));