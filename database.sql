-- TABLA DE USUARIOS (El equipo político)
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100),
    rol VARCHAR(20), -- 'ADMIN', 'COORDINADOR', 'LIDER'
    password VARCHAR(50) -- Para la prueba será simple
);

-- DATOS DE EJEMPLO (Para que puedas entrar)
INSERT INTO usuarios (nombre, rol, password) VALUES 
('Jefe Planeacion', 'ADMIN', 'admin123'),
('Coord. Juan', 'COORDINADOR', 'juan123'),
('Lider Pedro', 'LIDER', 'pedro123');

-- TABLA DE REFERIDOS (La gente)
CREATE TABLE referidos (
    id SERIAL PRIMARY KEY,
    cedula VARCHAR(20) UNIQUE NOT NULL, -- REQ 1.5: No permite duplicados
    nombre VARCHAR(100),
    mesa_votacion VARCHAR(10),
    voto BOOLEAN DEFAULT FALSE, -- REQ 2.2: Por defecto false
    fecha_voto TIMESTAMP,
    origen VARCHAR(20), -- 'MANUAL' o 'SCAN'
    id_responsable INTEGER REFERENCES usuarios(id) -- Quién lo trajo
);

-- TABLA DE AUDITORIA (Para los conflictos)
CREATE TABLE auditoria (
    id SERIAL PRIMARY KEY,
    evento VARCHAR(100), -- 'DUPLICADO', 'TRANSFERENCIA'
    descripcion TEXT,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);