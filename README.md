# ♛ Reino Rosa Imperial: El Palacio de Cristal

Videojuego 3D multijugador web construido con **Three.js (ES Modules)**, iluminación PBR realista (`RoomEnvironment`, sombras `PCFSoftShadowMap` y `UnrealBloomPass`), audio procedural con Web Audio API y multijugador **P2P online con PeerJS** (WebRTC con señalización automática: sin cuentas, sin claves API y sin servidor propio) y sin herramientas de compilación.

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
| **Clic en la escena** | Capturar el ratón (cámara libre con Pointer Lock) |
| `Tab` | Capturar / liberar el ratón (se libera solo al abrir Vestidor, Chat, diálogos o minijuegos) |
| **Arrastrar ratón** / `←` `→` | Girar la cámara orbital (sin captura) |
| **Rueda del ratón** | Acercar o alejar la cámara |
| `E` | Interactuar con NPCs, Vestidor o iniciar minijuegos |
| `C` | Abrir / cerrar el **Vestidor Real** |
| `T` | Escribir en el **Chat Rápido** del grupo |
| `Esc` | Cerrar diálogos o menús abiertos, o salir de un minijuego |
| `1` `2` `3` `4` | Poses en la Pasarela de Moda |

---

## 🌐 Multijugador Online (Sala Pública y Sala Privada)

El multijugador usa **PeerJS 1.5.4** (cargado desde `esm.sh`, con respaldo en `unpkg`): el servidor gratuito de PeerJS solo "presenta" a los navegadores y después el juego viaja **directo entre jugadores por WebRTC** (STUN de Google y Cloudflare). No hace falta crear cuentas ni pegar códigos largos, y funciona desde GitHub Pages.

Se usa una **topología en estrella**: quien abre la sala es el **anfitrión** y reenvía los mensajes al resto, así que pueden jugar 2, 5 o 10 amigas a la vez. Se sincronizan **movimiento y animaciones, emotes, ropa/peinado/accesorios, caballos (pelaje y pose de jinete), chat rápido con burbujas 3D, misiones y el reino elegido**.

### Sala Pública (1 clic)

1. Escribe tu **Nombre** (se guarda en el navegador), abre la pestaña **🌍 Multijugador Online** y pulsa **🌍 Entrar a Sala Pública**.
2. El primero en entrar se convierte en anfitrión; los demás se conectan solos a él.
3. Pulsa **✨ Entrar al Reino con la Sala**. Si el anfitrión se va, el resto se reconecta automáticamente en ~1 segundo (uno de ellos pasa a ser el nuevo anfitrión).

### Sala Privada (con código)

1. **Crear:** pulsa **👑 Crear Sala Privada**. Aparece un código corto (p. ej. `ROSA-4821`): pulsa **📋 Copiar Código** y pásaselo a tus amigas.
2. **Unirse:** escribe el código (vale `ROSA-4821`, `rosa 4821` o solo `4821`) y pulsa **🔑 Unirse**.
3. Si el anfitrión cierra el juego, la sala privada se cierra.

> **Dentro de la partida:** el botón **🌍 Salas Multijugador** (panel *Grupo Real*) abre el mismo menú. La píldora superior muestra el estado (`🟢 Pública · 3 jugadores · 42ms`); en una sala privada, haz clic en ella para copiar el código. Pulsa **[T]** o **💬** para el chat rápido (mientras escribes no te mueves).

### 🛠️ Solución de problemas de conexión

| Síntoma | Causa probable y solución |
|---|---|
| "No hay conexión con el servidor de salas" | Hace falta internet para la presentación inicial (servidor de PeerJS). Comprueba la conexión o el cortafuegos. |
| "La sala no existe o ya se ha cerrado" | El código está mal escrito o el anfitrión ya salió. Pide el código otra vez. |
| Se queda en *Conectando…* / "El anfitrión no responde" | Algunas redes (escolares o corporativas) bloquean las conexiones directas WebRTC. Prueba otra red (p. ej. datos móviles). |
| Probando en dos pestañas, el otro personaje no se mueve | El navegador congela la animación de las pestañas en segundo plano. Usa **dos ventanas** una al lado de la otra. |

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

El juego descarga **Three.js 0.160.0** desde `https://esm.sh` (definido en el `importmap` de `index.html`) la primera vez; después queda en la caché del navegador. El multijugador necesita internet para conectar con el servidor de señalización de PeerJS; el Service Worker nunca cachea ni intercepta esas peticiones.

### Alternativa: servirlo desde el PC del profesor en la red de clase

```bash
# En la carpeta del proyecto (requiere Python 3)
python -m http.server 8000
```

- En ese PC: abre `http://localhost:8000`.
- En el resto de PCs: abre `http://<IP-del-PC-del-profesor>:8000` (la IP se ve con `ipconfig` en Windows, p. ej. `192.168.1.20`). Si no carga, permite Python en el Firewall de Windows para redes privadas.
