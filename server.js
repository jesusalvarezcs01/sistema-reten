const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// =================================================================
// SOLUCIÓN DEFINITIVA: SEPARACIÓN TOTAL DE CAPAS
// =================================================================
const APP_HTML = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Sistema Electoral</title>
    
    <script src="https://unpkg.com/@microblink/blinkid-in-browser-sdk@5.8.0/ui/dist/blinkid-in-browser/blinkid-in-browser.js"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    
    <style>
        body, html { height: 100%; margin: 0; padding: 0; font-family: sans-serif; background: #f0f2f5; overflow: hidden; }

        /* --- CAPA 1: LOGIN (Z-INDEX ALTO) --- */
        #layer-login {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: #003366; /* Azul Institucional */
            z-index: 2000; /* Encima de todo */
            display: flex; flex-direction: column; justify-content: center; align-items: center;
        }

        /* --- CAPA 2: DASHBOARD (Z-INDEX MEDIO) --- */
        #layer-dashboard {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: #f4f7f6;
            z-index: 1000;
            display: none; /* Oculto hasta login */
            overflow-y: auto;
        }

        /* --- CAPA 3: CÁMARA (Z-INDEX MÁXIMO) --- */
        #layer-camera {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: black;
            z-index: 3000; /* Tapa incluso al login si se activa */
            display: none;
            flex-direction: column;
        }

        /* TARJETAS */
        .card { background: white; width: 90%; max-width: 400px; padding: 20px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); margin: 10px auto; text-align: center; }
        
        /* BOTONES */
        .btn { width: 100%; padding: 15px; border: none; border-radius: 5px; font-size: 16px; font-weight: bold; cursor: pointer; margin-top: 10px; }
        .btn-blue { background: #003366; color: white; }
        .btn-green { background: #28a745; color: white; }
        .btn-red { background: #dc3545; color: white; }
        
        input { width: 100%; padding: 12px; margin-bottom: 10px; border-radius: 5px; border: 1px solid #ccc; box-sizing: border-box; text-align: center; }

        /* MICROBLINK */
        blinkid-in-browser { width: 100%; height: 100%; display: block; }
        
        /* UI CAMARA */
        .cam-header { position: absolute; top: 0; left: 0; width: 100%; padding: 15px; z-index: 3001; display: flex; justify-content: space-between; background: rgba(0,0,0,0.5); color: white; box-sizing: border-box; }

        /* MODAL */
        #modal-result { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 4000; display: none; align-items: center; justify-content: center; }
    </style>
</head>
<body>

    <script>
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
            location.replace(\`https:\${location.href.substring(location.protocol.length)}\`);
        }
        const LICENCIA = "sRwCABpzaXN0ZW1hLXJldGVuLm9ucmVuZGVyLmNvbQZsZXlKRGNtVmhkR1ZrVDI0aU9qRTNOekF6TkRBNE56UXhORE1zSWtOeVpXRjBaV1JHYjNJaU9pSmhOVFkyT1RNeFppMWpNbVEyTFRRMk1UY3RZalF3T0MwM09Ea3dNVFJrT0RFMVpqQWlmUT09Xx8uagCPC8T3b3Qa3oHIoGgMBAgsat/gyX1+szaTbpLSxKbea+5LfnKoV2qjcJo5KX2BZfrFUBxFP093X0F3XpjecVfoJx+llc9E4c5k8MBT59V+d+ll6wtjn1EnjA==";
    </script>

    <div id="layer-login">
        <div class="card">
            <h2>🔐 ACCESO</h2>
            <input type="number" id="user" placeholder="Cédula">
            <input type="password" id="pass" placeholder="Contraseña">
            <button class="btn btn-green" onclick="doLogin()">ENTRAR</button>
            <p id="login-msg" style="color:red; display:none; margin-top:10px;">Error de credenciales</p>
        </div>
    </div>

    <div id="layer-dashboard">
        <div style="background:#003366; color:white; padding:15px; display:flex; justify-content:space-between; align-items:center;">
            <b id="user-name">Usuario</b>
            <button onclick="logout()" style="background:red; border:none; color:white; padding:5px 10px; border-radius:5px;">SALIR</button>
        </div>

        <br>
        <div class="card">
            <h3>DÍA D (VOTACIÓN)</h3>
            <p>Usar escáner para verificar votantes</p>
            <button class="btn btn-green" style="height: 60px; font-size: 1.2rem;" onclick="activarCamara()">📷 ABRIR ESCÁNER</button>
        </div>

        <div class="card">
            <h3>REGISTRO MANUAL</h3>
            <input type="text" id="reg-nombre" placeholder="Nombre">
            <input type="number" id="reg-cedula" placeholder="Cédula">
            <button class="btn btn-blue" onclick="guardarManual()">GUARDAR</button>
        </div>

        <div class="card">
            <h3>ESTADÍSTICAS</h3>
            <div style="display:flex; justify-content:space-around;">
                <div><h1><span id="st-total">0</span></h1>Total</div>
                <div style="color:green;"><h1><span id="st-votos">0</span></h1>Votaron</div>
            </div>
        </div>
    </div>

    <div id="layer-camera">
        <div class="cam-header">
            <span>Escaneando...</span>
            <button onclick="cerrarCamara()" style="background:white; color:black; border:none; padding:5px 15px; border-radius:15px; font-weight:bold;">CERRAR</button>
        </div>
        
        <blinkid-in-browser
            id="scanner-el"
            engine-location="https://unpkg.com/@microblink/blinkid-in-browser-sdk@5.8.0/resources/"
        ></blinkid-in-browser>
    </div>

    <div id="modal-result">
        <div class="card" id="modal-content"></div>
    </div>

    <script>
        const API = window.location.origin;
        let currentUser = null;

        // 1. VERIFICAR SESIÓN AL INICIO
        window.onload = () => {
            const session = localStorage.getItem('user_reten');
            if(session) {
                currentUser = JSON.parse(session);
                mostrarDashboard();
            }
        };

        // 2. FUNCIONES DE CAPAS
        function mostrarDashboard() {
            document.getElementById('layer-login').style.display = 'none'; // ADIOS LOGIN
            document.getElementById('layer-dashboard').style.display = 'block';
            document.getElementById('user-name').innerText = currentUser.nombres;
            cargarStats();
        }

        function activarCamara() {
            // MOSTRAR CAPA NEGRA
            document.getElementById('layer-camera').style.display = 'flex';
            
            // INICIAR MOTOR
            const el = document.getElementById('scanner-el');
            
            // CONFIGURAR Y ARRANCAR
            el.licenseKey = LICENCIA;
            el.recognizers = ['BlinkIdRecognizer'];
            
            // Escuchar eventos
            el.addEventListener('scanSuccess', (ev) => {
                const results = ev.detail.recognizers.BlinkIdRecognizer;
                if (results.resultState === 'Valid') {
                    // INTENTAR OBTENER NUMERO
                    let doc = results.documentNumber || results.mrz.documentNumber || results.mrz.primaryId;
                    if(doc) {
                        let cedula = doc.replace(/[^0-9]/g, ''); // Solo numeros
                        // EXITO -> CERRAR Y PROCESAR
                        cerrarCamara();
                        procesarVoto(cedula);
                    }
                }
            });

            // ERROR DE LICENCIA O CAMARA
            el.addEventListener('fatalError', (ev) => { alert("Error Cámara: " + ev.detail.message); cerrarCamara(); });
            el.addEventListener('scanError', (ev) => { 
                if(ev.detail.code === "LicenseError") alert("Error Licencia: Verifica Dominio"); 
            });
        }

        function cerrarCamara() {
            document.getElementById('layer-camera').style.display = 'none';
            // Opcional: Recargar para limpiar memoria de camara
            // location.reload(); 
        }

        // 3. LOGICA DE NEGOCIO
        async function doLogin() {
            const u = document.getElementById('user').value;
            const p = document.getElementById('pass').value;
            try {
                const res = await fetch(\`\${API}/api/login\`, {
                    method: 'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({usuario:u, password:p})
                });
                const data = await res.json();
                if(data.exito) {
                    currentUser = data.usuario;
                    localStorage.setItem('user_reten', JSON.stringify(currentUser));
                    mostrarDashboard();
                } else {
                    document.getElementById('login-msg').style.display = 'block';
                }
            } catch(e) { alert("Error red"); }
        }

        function logout() {
            localStorage.removeItem('user_reten');
            location.reload();
        }

        async function guardarManual() {
            const data = {
                nombre: document.getElementById('reg-nombre').value,
                num_doc: document.getElementById('reg-cedula').value,
                responsable_id: currentUser.id
            };
            const res = await fetch(\`\${API}/api/crear_referido\`, {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify(data)
            });
            const r = await res.json();
            if(r.exito) { alert("Guardado"); cargarStats(); document.getElementById('reg-cedula').value=''; }
            else alert(r.mensaje);
        }

        async function cargarStats() {
            const res = await fetch(\`\${API}/api/dashboard/stats\`);
            const data = await res.json();
            document.getElementById('st-total').innerText = data.total;
            document.getElementById('st-votos').innerText = data.votos;
        }

        async function procesarVoto(cedula) {
            const modal = document.getElementById('modal-result');
            const content = document.getElementById('modal-content');
            modal.style.display = 'flex';
            content.innerHTML = '<h3>⏳ Verificando '+cedula+'...</h3>';

            try {
                const res = await fetch(\`\${API}/api/verificar/\${cedula}\`);
                const data = await res.json();

                if(data.estado === 'NUEVO') {
                    content.innerHTML = '<h1 style="color:red">❌</h1><h3>NO REGISTRADO</h3><p>Cédula '+cedula+' no está en lista.</p><button class="btn btn-red" onclick="closeModal()">CERRAR</button>';
                } else if(data.estado === 'YA_VOTO') {
                    content.innerHTML = '<h1 style="color:orange">⚠️</h1><h3>YA VOTÓ</h3><p>Líder: '+data.datos.nombre_coordinador+'</p><button class="btn btn-blue" onclick="closeModal()">CERRAR</button>';
                } else {
                    // REGISTRAR EL VOTO
                    await fetch(\`\${API}/api/referidos/votar/\${cedula}\`, {method:'PUT'});
                    content.innerHTML = '<h1 style="color:green">✅</h1><h3>VOTO EXITOSO</h3><p>'+data.datos.nombre_completo+'<br>Mesa: '+data.datos.mesa_votacion+'</p><button class="btn btn-green" onclick="closeModal()">ACEPTAR</button>';
                    cargarStats();
                }
            } catch(e) {
                content.innerHTML = 'Error de conexión';
                setTimeout(closeModal, 2000);
            }
        }

        function closeModal() { document.getElementById('modal-result').style.display = 'none'; }

    </script>
</body>
</html>
`;

// =================================================================
// BACKEND
// =================================================================
app.get('/', (req, res) => res.send(APP_HTML));

app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body;
  const r = await pool.query('SELECT * FROM usuarios WHERE numero_documento = $1 AND password = $2', [usuario, password]);
  if(r.rows.length > 0) res.json({exito:true, usuario:r.rows[0]});
  else res.json({exito:false});
});

app.get('/api/dashboard/stats', async (req, res) => {
  const t = await pool.query('SELECT COUNT(*) FROM referidos');
  const v = await pool.query('SELECT COUNT(*) FROM referidos WHERE estado_voto = true');
  res.json({ total: t.rows[0].count, votos: v.rows[0].count });
});

app.post('/api/crear_referido', async (req, res) => {
  const { nombre, num_doc, responsable_id } = req.body;
  try {
    const chk = await pool.query('SELECT * FROM referidos WHERE numero_documento = $1', [num_doc]);
    if(chk.rows.length>0) return res.json({exito:false, mensaje:'DUPLICADO'});
    await pool.query('INSERT INTO referidos (nombre_completo, numero_documento, responsable_id) VALUES ($1, $2, $3)', [nombre, num_doc, responsable_id]);
    res.json({exito:true});
  } catch(e) { res.json({exito:false, mensaje:e.message}); }
});

app.get('/api/verificar/:cedula', async (req, res) => {
  const { cedula } = req.params;
  const r = await pool.query(`SELECT r.*, u.nombres as nombre_coordinador FROM referidos r JOIN usuarios u ON r.responsable_id = u.id WHERE r.numero_documento = $1`, [cedula]);
  if (r.rows.length === 0) return res.json({ estado: 'NUEVO' });
  if (r.rows[0].estado_voto) return res.json({ estado: 'YA_VOTO', datos: r.rows[0] });
  return res.json({ estado: 'REGISTRADO', datos: r.rows[0] });
});

app.put('/api/referidos/votar/:cedula', async (req, res) => {
  await pool.query('UPDATE referidos SET estado_voto = true WHERE numero_documento = $1', [req.params.cedula]);
  res.json({ exito: true });
});

app.get('/setup_master_v3', async (req, res) => {
    // REINICIO DE EMERGENCIA - SOLO SI NECESITAS RECREAR TABLAS
    // Para usarlo, entra a /setup_master_v3
    try {
        await pool.query('DROP TABLE IF EXISTS referidos; DROP TABLE IF EXISTS usuarios;');
        await pool.query(`CREATE TABLE usuarios (id SERIAL PRIMARY KEY, nombres VARCHAR(100), numero_documento VARCHAR(20), password VARCHAR(100), rol VARCHAR(20));`);
        await pool.query(`CREATE TABLE referidos (id SERIAL PRIMARY KEY, nombre_completo VARCHAR(150), numero_documento VARCHAR(20), mesa_votacion VARCHAR(10), estado_voto BOOLEAN DEFAULT FALSE, responsable_id INTEGER);`);
        await pool.query(`INSERT INTO usuarios (nombres, numero_documento, password, rol) VALUES ('Admin', 'admin', 'admin2026', 'ADMIN');`);
        res.send("DB REINICIADA");
    } catch(e) { res.send(e.message); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SERVER ON ${PORT}`));
