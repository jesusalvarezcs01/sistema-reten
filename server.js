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
// V16: TECNOLOGÍA LIGERA (CÓDIGO DE BARRAS / HTML5-QRCODE)
// =================================================================
const APP_HTML = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Sistema Electoral</title>
    
    <script src="https://unpkg.com/html5-qrcode" type="text/javascript"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    
    <style>
        body, html { height: 100%; margin: 0; padding: 0; font-family: sans-serif; background: #000; overflow: hidden; }

        /* UI LAYERS */
        #layer-ui { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #f4f7f6; z-index: 10; overflow-y: auto; }
        #layer-camera { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #000; z-index: 20; display: none; flex-direction: column; }

        /* CARDS */
        .card { background: white; width: 90%; max-width: 400px; padding: 20px; border-radius: 12px; margin: 20px auto; text-align: center; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .btn { width: 100%; padding: 15px; border: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin-top: 10px; color: white; cursor: pointer; }
        .btn-green { background: #28a745; }
        .btn-blue { background: #003366; }
        input { width: 100%; padding: 12px; margin-bottom: 10px; text-align: center; border: 1px solid #ddd; border-radius: 5px; }

        /* SCANNER AREA */
        #reader { width: 100%; height: 100%; background: black; }
        
        /* OVERLAY */
        .scan-header { position: absolute; top: 0; left: 0; width: 100%; padding: 15px; display: flex; justify-content: space-between; z-index: 30; background: rgba(0,0,0,0.5); color: white; }
        .scan-instruction { position: absolute; bottom: 50px; width: 100%; text-align: center; color: white; font-weight: bold; background: rgba(0,0,0,0.5); padding: 10px; z-index: 30; }

        /* MODAL */
        #modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 100; display: none; align-items: center; justify-content: center; }
        #modal-box { background: white; padding: 25px; border-radius: 10px; width: 85%; max-width: 350px; text-align: center; }
    </style>
</head>
<body>

    <div id="layer-ui">
        <div id="view-login" style="height: 100vh; display: flex; align-items: center; justify-content: center; background: #003366;">
            <div class="card">
                <h2>CONTROL ELECTORAL</h2>
                <input type="number" id="l-user" placeholder="Cédula">
                <input type="password" id="l-pass" placeholder="Contraseña">
                <button class="btn btn-green" onclick="doLogin()">ENTRAR</button>
            </div>
        </div>

        <div id="view-dashboard" style="display:none; padding-top: 60px;">
            <div style="background:#003366; color:white; padding:15px; position:fixed; top:0; left:0; width:100%; z-index:100; display:flex; justify-content:space-between;">
                <b id="u-name">Usuario</b> <span onclick="logout()">SALIR</span>
            </div>
            
            <div class="card" onclick="irRegistro()"><h3>📝 REGISTRO MANUAL</h3></div>
            
            <div class="card" onclick="activarCamara()" style="border: 3px solid #28a745;">
                <h3 style="color:#28a745">📷 ESCÁNER RÁPIDO</h3>
                <p>Lee el Código de Barras (Atrás)</p>
            </div>
            
            <div class="card"><h3>Total: <span id="s-total">0</span> | Votos: <span id="s-votos">0</span></h3></div>
        </div>

        <div id="view-registro" style="display:none; padding-top:20px;">
            <div class="card">
                <h3>Nuevo</h3>
                <input type="text" id="r-nom" placeholder="Nombre"><input type="number" id="r-ced" placeholder="Cédula">
                <button class="btn btn-blue" onclick="guardar()">GUARDAR</button><button class="btn btn-red" onclick="verDashboard()">VOLVER</button>
            </div>
        </div>
    </div>

    <div id="layer-camera">
        <div class="scan-header">
            <span>Escáner V16</span>
            <button onclick="cerrarCamara()" style="background:white; color:black; border:none; padding:5px 15px; border-radius:15px;">X</button>
        </div>
        
        <div id="reader"></div>
        
        <div class="scan-instruction">
            APUNTA AL CÓDIGO DE BARRAS<br>(Parte de atrás de la Cédula)
        </div>
    </div>

    <div id="modal-overlay"><div id="modal-box"></div></div>

    <script>
        const API = window.location.origin;
        let currentUser = null;
        let html5QrCode;

        function verDashboard() {
            document.getElementById('view-login').style.display = 'none';
            document.getElementById('view-registro').style.display = 'none';
            document.getElementById('view-dashboard').style.display = 'block';
            cargarStats();
        }
        function irRegistro() {
            document.getElementById('view-dashboard').style.display = 'none';
            document.getElementById('view-registro').style.display = 'block';
        }

        // --- CÁMARA LIGERA (HTML5-QRCODE) ---
        function activarCamara() {
            document.getElementById('layer-ui').style.display = 'none';
            document.getElementById('layer-camera').style.display = 'flex';
            
            html5QrCode = new Html5Qrcode("reader");
            
            const config = { fps: 10, qrbox: { width: 250, height: 150 } };
            
            // Pedimos cámara trasera
            html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure)
            .catch(err => {
                alert("Error iniciando cámara: " + err);
                cerrarCamara();
            });
        }

        function onScanSuccess(decodedText, decodedResult) {
            // DETECTAMOS CUALQUIER NUMERO LARGO EN EL CODIGO DE BARRAS
            // Las cedulas colombianas en PDF417 tienen mucha basura, buscamos la cedula
            console.log("Escaneado: " + decodedText);
            
            // Regex simple para encontrar secuencias de numeros de 6 a 10 digitos
            // Ajustamos para intentar pescar la cedula en el mar de texto del PDF417
            let matches = decodedText.match(/\\d{6,10}/g);
            
            if (matches) {
                // Asumimos que la cédula es el número más largo o el primero válido
                // En PDF417 Colombiano, la cedula suele estar al principio tras algunos ceros
                // Para simplificar, tomamos el primer numero valido encontrado
                let cedulaPosible = matches.find(n => n.length >= 6 && n.length <= 10 && parseInt(n) > 100000);
                
                if(cedulaPosible) {
                    html5QrCode.stop().then(() => {
                        verificarCedula(cedulaPosible);
                    });
                }
            }
        }

        function onScanFailure(error) {
            // No hacer nada, sigue escaneando
        }

        function cerrarCamara() {
            if(html5QrCode) {
                html5QrCode.stop().then(() => {
                    document.getElementById('layer-camera').style.display = 'none';
                    document.getElementById('layer-ui').style.display = 'block';
                    html5QrCode.clear();
                }).catch(err => {
                    location.reload();
                });
            } else {
                location.reload();
            }
        }

        // --- NEGOCIO ---
        async function verificarCedula(cedula) {
            const box = document.getElementById('modal-box');
            document.getElementById('modal-overlay').style.display = 'flex';
            box.innerHTML = '<h3>¿Es esta la cédula?</h3><h1>'+cedula+'</h1><br><button class="btn btn-green" onclick="procesarVerdadera(\\''+cedula+'\\')">SÍ, VERIFICAR</button><button class="btn btn-red" onclick="cerrarModalCam()">NO, REINTENTAR</button>';
        }
        
        function cerrarModalCam() {
             document.getElementById('modal-overlay').style.display = 'none';
             activarCamara(); // Volver a escanear
        }

        async function procesarVerdadera(cedula) {
            const box = document.getElementById('modal-box');
            box.innerHTML = '<h3>⏳ Consultando BD...</h3>';
            
            try {
                const res = await fetch(API+'/api/verificar/'+cedula);
                const d = await res.json();

                if(d.estado === 'NUEVO') {
                    box.innerHTML = '<h1 style="color:red">X</h1><h3>NO REGISTRADO</h3><button class="btn btn-blue" onclick="cerrarTodo()">OK</button>';
                } else if(d.estado === 'YA_VOTO') {
                    box.innerHTML = '<h1 style="color:orange">⚠️</h1><h3>YA VOTÓ</h3><p>'+d.datos.nombre_coordinador+'</p><button class="btn btn-blue" onclick="cerrarTodo()">OK</button>';
                } else {
                    await fetch(API+'/api/referidos/votar/'+cedula, {method:'PUT'});
                    box.innerHTML = '<h1 style="color:green">✅</h1><h3>VOTO REGISTRADO</h3><p>'+d.datos.nombre_completo+'</p><button class="btn btn-blue" onclick="cerrarTodo()">OK</button>';
                }
            } catch(e) {
                alert("Error de red");
                cerrarTodo();
            }
        }
        
        function cerrarTodo() {
            document.getElementById('modal-overlay').style.display = 'none';
            document.getElementById('layer-camera').style.display = 'none';
            document.getElementById('layer-ui').style.display = 'block';
            cargarStats();
        }

        // --- LOGIN/SESSION ---
        async function doLogin() {
            const u = document.getElementById('l-user').value;
            const p = document.getElementById('l-pass').value;
            const res = await fetch(API+'/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({usuario:u, password:p})});
            const data = await res.json();
            if(data.exito) {
                localStorage.setItem('user', JSON.stringify(data.usuario));
                checkSession();
            } else alert('Error Login');
        }

        function checkSession() {
            const s = localStorage.getItem('user');
            if(s) {
                currentUser = JSON.parse(s);
                document.getElementById('u-name').innerText = currentUser.nombres;
                verDashboard();
            }
        }
        function logout() { localStorage.clear(); location.reload(); }

        async function guardar() {
            const data = { nombre: document.getElementById('r-nom').value, num_doc: document.getElementById('r-ced').value, responsable_id: currentUser.id };
            await fetch(API+'/api/crear_referido', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
            alert('Guardado'); document.getElementById('r-ced').value=''; verDashboard();
        }

        async function cargarStats() {
            const res = await fetch(API+'/api/dashboard/stats');
            const d = await res.json();
            document.getElementById('s-total').innerText = d.total;
            document.getElementById('s-votos').innerText = d.votos;
        }

        window.onload = checkSession;
    </script>
</body>
</html>
`;

// API
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
  try {
    await pool.query('DROP TABLE IF EXISTS referidos; DROP TABLE IF EXISTS usuarios;');
    await pool.query(`CREATE TABLE usuarios (id SERIAL PRIMARY KEY, nombres VARCHAR(100), numero_documento VARCHAR(20), password VARCHAR(100), rol VARCHAR(20));`);
    await pool.query(`CREATE TABLE referidos (id SERIAL PRIMARY KEY, nombre_completo VARCHAR(150), numero_documento VARCHAR(20), mesa_votacion VARCHAR(10), estado_voto BOOLEAN DEFAULT FALSE, responsable_id INTEGER);`);
    await pool.query(`INSERT INTO usuarios (nombres, numero_documento, password, rol) VALUES ('Admin', 'admin', 'admin2026', 'ADMIN');`);
    res.send("RESET OK");
  } catch(e) { res.send(e.message); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SERVER ON ${PORT}`));
