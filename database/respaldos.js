// database/respaldos.js
// Copias de seguridad automaticas de la base de datos.
// - Al iniciar el sistema y luego cada hora se actualiza la copia del dia:
//     database/respaldos/almacen-AAAA-MM-DD.db
// - Se conservan las copias de los ultimos 60 dias.

const fs = require('fs');
const path = require('path');

const CARPETA = path.join(__dirname, 'respaldos');
const DIAS_A_CONSERVAR = 60;
const CADA_MS = 60 * 60 * 1000; // 1 hora

function fechaLocal() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

function limpiarAntiguos(carpeta, conservar) {
  const archivos = fs.readdirSync(carpeta)
    .filter((n) => /^almacen-\d{4}-\d{2}-\d{2}\.db$/.test(n))
    .sort();
  archivos.slice(0, Math.max(0, archivos.length - conservar))
    .forEach((n) => fs.rmSync(path.join(carpeta, n)));
}

function hacerRespaldo(db, carpeta = CARPETA) {
  try {
    fs.mkdirSync(carpeta, { recursive: true });
    const destino = path.join(carpeta, `almacen-${fechaLocal()}.db`);
    const temporal = destino + '.tmp';
    if (fs.existsSync(temporal)) fs.rmSync(temporal);

    // VACUUM INTO genera una copia completa y consistente, aun con el sistema en uso
    db.exec(`VACUUM INTO '${temporal.replace(/'/g, "''")}'`);
    fs.renameSync(temporal, destino);

    limpiarAntiguos(carpeta, DIAS_A_CONSERVAR);
    return destino;
  } catch (err) {
    console.error('No se pudo crear el respaldo automatico:', err.message);
    return null;
  }
}

function iniciarRespaldos(db) {
  hacerRespaldo(db);
  setInterval(() => hacerRespaldo(db), CADA_MS);
}

module.exports = { iniciarRespaldos, hacerRespaldo };
