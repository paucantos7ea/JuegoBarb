# ♛ Reino Rosa Imperial: El Palacio de Cristal

Videojuego 3D multijugador web construido con **Three.js (ES Modules)**, iluminación PBR realista (`RoomEnvironment`, sombras `PCFSoftShadowMap` y `UnrealBloomPass`), audio procedural con Web Audio API y multijugador **P2P 100% en red local (LAN)** mediante **WebRTC nativo** sin servidores externos ni herramientas de compilación.

---

## ✨ Características Principales

- **3 Mundos Seleccionables (y cambiables en tiempo real):**
  1. **Palacio de Cristal (Hora Dorada):** Reino principal luminoso con jardines reales y castillo completo.
  2. **Jardines de Perla (Atardecer Rosa):** Luz cálida de atardecer, fuentes iluminadas y miradores.
  3. **Gala Imperial (Noche Estrellada):** Noche mágica con cielo estrellado, cristales brillantes y pista de baile iluminada.
- **Palacio Explorable sin Pantallas de Carga:**
  - *Interior:* Gran Vestíbulo con escalinata doble y lámpara de araña, **Vestidor Real** con espejos de cuerpo entero, **Salón de Baile** con pista iluminada y **Balcón Real** en la segunda planta.
  - *Exterior:* Plaza con Fuente Monumental animada, Pasarela de Moda Real, Jardines Geométricos con Pabellón de Rosas y Mirador Real sobre el lago.
- **Vestidor Real (`[C]`):** 4 conjuntos (*Gala Rosa Imperial*, *Casual Chic*, *Equitación Real*, *Cristal Nocturno*), 3 peinados y 4 accesorios combinables (*Tiara*, *Gafas de sol*, *Bolso*, *Cetro*) visibles al instante para todo el grupo.
- **4 Personajes Interactivos (`[E]`):** Príncipe Adrián, Estilista Sofía, Princesa Camila y Maestra de Ceremonias.
- **3 Misiones Sincronizadas en Cooperativo:** *Lista para la Gala*, *Las Gemas del Reino* (5 gemas ocultas) e *Invitaciones Reales*.
- **3 Minijuegos con Carga Diferida (`await import()`):**
  - **Pasarela de Moda Real** (poses cronometradas y cámara cinematográfica).
  - **Baile en el Salón Real** (juego de ritmo musical con `W A S D`).
  - **Carrera Contrarreloj por los Jardines** (circuito de 8 aros dorados con haz guía).

---

## 🎮 Controles

| Tecla / Acción | Función |
|---|---|
| `W`, `A`, `S`, `D` | Mover al personaje |
| `Shift` | Correr |
| `Espacio` | Saltar |
| **Arrastrar ratón** / `←` `→` | Girar la cámara orbital |
| **Rueda del ratón** | Acercar o alejar la cámara |
| `E` | Interactuar con NPCs, Vestidor o iniciar minijuegos |
| `C` | Abrir / cerrar el **Vestidor Real** |
| `T` | Escribir en el **Chat Rápido** del grupo |
| `Esc` | Cerrar diálogos o menús abiertos, o salir de un minijuego |
| `1` `2` `3` `4` | Poses en la Pasarela de Moda |

---

## 🌐 Cómo Conectar Compañeros en Clase (Red Local LAN sin Servidor)

El multijugador usa **WebRTC nativo (`RTCPeerConnection` con `iceServers: []`)**: los navegadores se conectan **directamente** entre sí dentro de la misma red local, sin servidores STUN/TURN ni servidor de juego. Para "presentarse" se intercambian dos códigos de texto (~650 caracteres, comprimidos) que copiáis y pegáis por el medio que queráis (chat del aula, Teams/Classroom, un documento compartido…).

Se usa una **topología en estrella**: el Host está conectado a cada invitado y reenvía los mensajes entre ellos. Se sincronizan **movimiento y animaciones, ropa/peinado/accesorios, chat rápido, misiones y gemas, y el reino elegido**.

### Paso a paso

1. Todos abren el juego (la URL de GitHub Pages o el servidor local, ver más abajo) **en la misma red WiFi o cable de clase**. Recomendado: Chrome o Edge actualizados.
2. Cada jugador escribe su **Nombre**, elige **Avatar** y abre la pestaña **Cooperativo (Red Local)**.
3. **Host** → pulsa **Crear Grupo (Host)** → pulsa **Copiar** en el *Paso 1* y envía ese **código de invitación** a UN compañero.
4. **Invitado** → pulsa **Unirse a Grupo (Invitado)** → pega el código en el *Paso 1* → **Generar** → pulsa **Copiar** en el *Paso 2* y devuelve ese **código de respuesta** al Host.
5. **Host** → pega la respuesta en su *Paso 2* → **Conectar**. En unos segundos el compañero aparece en *Grupo conectado* y al invitado se le activa el botón **¡Conectado! Entrar al Reino**.
6. **Para más compañeros:** cada código de invitación sirve para **una sola persona**. Tras conectar a alguien, el código del *Paso 1* se renueva automáticamente: repite los pasos 3–5 con el siguiente compañero (también puedes forzar uno nuevo con **+ Nuevo código**).
7. **Host** → **Iniciar Aventura con el Grupo**: todos los invitados que sigan en el menú entran automáticamente al mismo reino.

> **Invitar a mitad de partida:** el Host tiene el botón **+ Invitar compañero LAN** en el panel *Grupo Real*. El nuevo invitado sigue los pasos 4–5 y, al entrar, recibe el progreso de misiones del grupo.

### 🛠️ Solución de problemas de conexión

| Síntoma | Causa probable y solución |
|---|---|
| "No se pudo conectar con …" o se queda en *Conectando…* | Los PCs no se "ven" en la red. Comprobad que estáis en la **misma WiFi/red** (no una en WiFi de alumnos y otra en cable de profesores). Generad un **código nuevo** y repetid. |
| Falla siempre en la WiFi del centro | Muchas redes escolares activan el **aislamiento de clientes** (los equipos no pueden hablar entre sí). Sin servidores externos no hay forma de saltarlo: pedid al responsable TIC que lo desactive para el aula, o usad la **red por cable** o un **router/punto de acceso propio** de la clase. |
| Falla entre PCs pero funciona entre dos pestañas del mismo PC | Chrome/Edge ocultan la IP local tras nombres `*.local` (mDNS). Si la red bloquea mDNS/multicast, la conexión no se establece. Probad con la red por cable o un punto de acceso propio. |
| "Esta respuesta no corresponde al código de invitación actual" | El Host generó un código nuevo después de enviar el anterior. Enviad el código que aparece **ahora** en el Paso 1 y repetid. |
| "Código inválido" | El código se copió incompleto. Usad siempre el botón **Copiar**. |
| El botón Copiar no copia | En `http://` con IP (no `localhost`) el navegador limita el portapapeles; el juego usa un método alternativo, pero si falla, selecciona el texto y pulsa `Ctrl+C`. |

---

## 🚀 Cómo Activar GitHub Pages

1. En el repositorio de GitHub ve a **Settings** → **Pages** (menú lateral, sección *Code and automation*).
2. En **Build and deployment** → **Source**, elige **Deploy from a branch**.
3. En **Branch** selecciona `main` y la carpeta `/ (root)` → **Save**.
4. Espera 1–2 minutos (la pestaña **Actions** muestra el despliegue *pages build and deployment*) y recarga **Settings → Pages**: aparecerá la URL pública. Para este repositorio será:
   **https://paucantos7ea.github.io/JuegoBarb/**
5. Comparte esa URL con la clase. Cada vez que hagas `git push` a `main`, la web se actualiza sola en ~1 minuto (si no ves los cambios, recarga con `Ctrl+F5`).

> El proyecto está preparado para funcionar dentro de un subdirectorio (`/JuegoBarb/`): todas las rutas son relativas (`./css/…`, `./js/…`) y respetan mayúsculas/minúsculas (GitHub Pages corre en Linux). El archivo `.nojekyll` evita que GitHub procese el sitio con Jekyll. No hace falta compilar nada.

### Requisitos de internet

El juego descarga **Three.js 0.160.0** desde `https://esm.sh` (definido en el `importmap` de `index.html`) la primera vez; después queda en la caché del navegador. **El multijugador no usa internet**: el tráfico de juego viaja solo por la red local.

### Alternativa: servirlo desde el PC del profesor en la red de clase

```bash
# En la carpeta del proyecto (requiere Python 3)
python -m http.server 8000
```

- En ese PC: abre `http://localhost:8000`.
- En el resto de PCs: abre `http://<IP-del-PC-del-profesor>:8000` (la IP se ve con `ipconfig` en Windows, p. ej. `192.168.1.20`). Si no carga, permite Python en el Firewall de Windows para redes privadas.
