# Modelos 3D (.GLB) y Animaciones Mixamo

Esta carpeta (`JuegoBarb/assets/models/`) aloja los modelos 3D opcionales en formato **glTF binario (`.glb`)**.  
Si un archivo `.glb` no está presente, el juego carga de forma silenciosa y automática el rig procedural del personaje sin mostrar errores.

### ⚠️ Registra cada modelo en `models.json`

Para no generar peticiones 404 (líneas rojas en la consola) por modelos que aún no existen, el juego solo descarga los `.glb` listados en [`models.json`](./models.json). Al añadir un archivo, añade su nombre a la lista:

```json
{
  "available": ["avatar_1.glb", "principe_adrian.glb"]
}
```

> Si borras `models.json`, el juego vuelve a intentar descargar los 8 modelos (funciona igual, pero con 404 en consola para los que falten).

---

## 1. Nombres de archivo esperados (8 personajes)

### Avatares jugables
| ID del avatar | Nombre en el juego | Ruta esperada |
| --- | --- | --- |
| `aurora` | Aurora | `assets/models/avatar_1.glb` |
| `valentina` | Valentina | `assets/models/avatar_2.glb` |
| `celeste` | Celeste | `assets/models/avatar_3.glb` |
| `amara` | Amara | `assets/models/avatar_4.glb` |

### NPCs del Palacio de Cristal
| ID del NPC | Nombre en el juego | Ruta esperada |
| --- | --- | --- |
| `npc_adrian` | Príncipe Adrián | `assets/models/principe_adrian.glb` |
| `npc_sofia` | Estilista Sofía | `assets/models/estilista_sofia.glb` |
| `npc_camila` | Princesa Camila | `assets/models/princesa_camila.glb` |
| `npc_maestra` | Maestra de Ceremonias | `assets/models/maestra_ceremonias.glb` |

---

## 2. Clips de animación reconocidos

`CharacterRig` busca automáticamente los clips de animación por coincidencia flexible de nombre (mayúsculas o minúsculas, incluyendo prefijos como `Armature|Idle`):

- **`Idle`** *(también `stand`, `breath`, `wait`, `rest`, `reposo`)* — Reposo.
- **`Walk`** *(también `stroll`, `march`, `andar`, `caminar`)* — Caminar.
- **`Run`** *(también `sprint`, `jog`, `correr`)* — Correr (si falta, usa `Walk`).
- **`Jump`** *(también `leap`, `hop`, `saltar`, `salto`)* — Salto (reproducción única con sujeción al final).
- **`Dance`** *(también `groove`, `party`, `baile`, `bailar`)* — Baile del Salón Real.
- **`Pose`** *(también `wave`, `greet`, `bow`, `runway`, `posar`, `saludo`)* — Pasarela de Moda y saludo de NPCs (si falta, usa `Dance` o `Idle`).

> Si el `.glb` contiene un único clip (por ejemplo `mixamo.com` o `Take 001`), se usará como respaldo para todos los estados.

---

## 3. Guía rápida en 3 pasos (Mixamo + Blender → `.glb`)

1. **Preparar y animar en Mixamo:**
   - Sube o elige tu personaje en [Mixamo](https://www.mixamo.com/) y descarga la malla base en T-Pose (`FBX Binary`, `With Skin`).
   - Descarga las animaciones deseadas (`Idle`, `Walking`, `Running`, `Jump`, `Dancing`, `Waving`/`Pose`) activando **"In Place"** en caminar y correr, y seleccionando `Without Skin`.
2. **Unir clips y nombrar materiales en Blender:**
   - Importa el FBX base en Blender y luego importa los FBX de animaciones (puedes borrar sus armatures sobrantes y conservar únicamente sus *Actions*).
   - En el **Dope Sheet → Action Editor / NLA Editor**, renombra cada acción exactamente como `Idle`, `Walk`, `Run`, `Jump`, `Dance`, `Pose` y añádelas como pistas NLA del armature principal (**Push Down**).
   - *(Opcional para teñido en el Vestidor `[C]`)*: nombra los materiales/mallas que **no** deban teñirse con palabras como `Skin`, `Face`, `Eye`, `Lip`, `Hair`, `Teeth`, `Gold`/`Metal`/`Gem`; el resto de materiales de ropa se teñirán con el conjunto elegido.
3. **Exportar a `.glb`:**
   - Ve a **File → Export → glTF 2.0 (.glb/.gltf)** con formato **glTF Binary (`.glb`)**, marca **Include → Selected/Visible Objects** y **Animation → NLA Tracks** (o *All Actions*).
   - El cargador `ModelLoader.js` normaliza automáticamente la altura a **`1.75` unidades**, centra `X/Z` en `0` y apoya los pies exactamente en `Y = 0`.

---

## 4. Prueba instantánea desde el Vestidor `[C]`

No necesitas reiniciar el servidor para probar un modelo nuevo:

1. Entra en partida y pulsa **`[C]`** (o el botón **👗 Vestidor**) para abrir el **Vestidor Real**.
2. Desplázate a la sección **Modelo 3D Personalizado (.GLB)** y pulsa **"📂 Probar modelo .GLB local"**.
3. Selecciona tu archivo `.glb` o `.gltf`: se cargará al instante en vista local (sin enviarse por red multijugador).
4. Puedes cambiar de **Conjunto de Moda** en el Vestidor para probar el teñido de ropa, o pulsar **"↺ Volver al avatar base"** para restaurar el personaje original.
