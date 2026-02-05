const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// CONEXIÓN A LA BASE DE DATOS (Render nos dará esta URL luego)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- RUTA 1: VERIFICAR CÉDULA (EL ESCÁNER LLAMA AQUÍ) ---
app.get('/api/verificar/:cedula', async (req, res) => {
  const { cedula } = req.params;
  
  try {
    // Buscamos si existe
    const result = await pool.query('SELECT * FROM referidos WHERE cedula = $1', [cedula]);
    
    if (result.rows.length === 0) {
      // CASO AMARILLO: NO EXISTE
      return res.json({ estado: 'NUEVO', mensaje: 'Votante no registrado' });
    }

    const referido = result.rows[0];

    if (referido.voto) {
        // CASO ROJO: YA VOTÓ
        return res.json({ estado: 'YA_VOTO', datos: referido });
    }

    // Si existe y NO ha votado, necesitamos saber de quién es para ver si es TRANSFERENCIA
    // Aquí devolvemos los datos para que el Frontend decida si muestra Verde o Naranja
    return res.json({ estado: 'REGISTRADO', datos: referido });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// --- RUTA 2: REGISTRAR VOTO (CONFIRMACIÓN VERDE / NARANJA) ---
app.post('/api/votar', async (req, res) => {
  const { cedula, id_nuevo_responsable, es_transferencia } = req.body;
  
  try {
    const fecha = new Date();

    if (es_transferencia) {
        // LÓGICA DE TRANSFERENCIA (CASO NARANJA)
        // 1. Actualizamos el dueño y marcamos el voto
        await pool.query(
            'UPDATE referidos SET voto = true, fecha_voto = $1, id_responsable = $2 WHERE cedula = $3',
            [fecha, id_nuevo_responsable, cedula]
        );
        // 2. Guardamos en auditoría que hubo un "robo" de base (legal)
        await pool.query(
            'INSERT INTO auditoria (evento, descripcion) VALUES ($1, $2)',
            ['TRANSFERENCIA', `Cédula ${cedula} transferida al responsable ID ${id_nuevo_responsable}`]
        );
    } else {
        // VOTO NORMAL (CASO VERDE)
        await pool.query(
            'UPDATE referidos SET voto = true, fecha_voto = $1 WHERE cedula = $2',
            [fecha, cedula]
        );
    }

    res.json({ exito: true, mensaje: 'Voto registrado correctamente' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar voto' });
  }
});

// --- RUTA 3: CREAR NUEVO (CASO AMARILLO) ---
app.post('/api/nuevo', async (req, res) => {
  const { cedula, nombre, id_responsable } = req.body;
  
  try {
    await pool.query(
        'INSERT INTO referidos (cedula, nombre, voto, fecha_voto, origen, id_responsable) VALUES ($1, $2, true, NOW(), $3, $4)',
        [cedula, nombre, 'SCAN', id_responsable]
    );
    res.json({ exito: true, mensaje: 'Nuevo votante creado y marcado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear' });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando en puerto ${PORT}`);
});