# CHALLENGE · guía de instalación

App web del reto (11 oct 2026 → 12 mar 2027). Cada participante entra con su correo y contraseña y registra **sus propias** semanas y mediciones. Todos ven el ranking. Tú (admin) puedes agregar gente y corregir cualquier dato.

**Piezas:**

- `index.html`, `app.js`, `config.js`: la página. Es estática, así que se puede publicar gratis en GitHub Pages.
- `supabase/schema.sql`: la base de datos y sus reglas de seguridad.
- Supabase (gratis): guarda los datos y maneja el login.

Son unos 20 minutos en total.

---

## 1. Crear el proyecto en Supabase

1. Entra a **supabase.com** → *Start your project* → inicia sesión con tu cuenta de GitHub (Kats28).
2. *New project*. Nombre: `challenge`. Pon una contraseña de base de datos (guárdala, aunque casi no la vas a usar). Región: **East US** (la más cercana a Guatemala).
3. Espera 1–2 minutos a que termine de crearse.

## 2. Crear las tablas

1. Menú izquierdo → **SQL Editor** → *New query*.
2. Abre `supabase/schema.sql`, copia **todo**, pégalo y presiona **Run**. Debe decir *Success*.
3. Ahora agrégate como administradora. En una consulta nueva, cambia tus datos y corre:

```sql
insert into public.participantes (nombre, email, sexo, estatura_cm, es_admin)
values ('Kats', 'kzabaleta.28@gmail.com', 'F', 160, true);
```

`sexo` es `'F'` o `'M'` y la estatura va en centímetros (se usan en la fórmula de % de grasa con cinta). El correo va en minúsculas.

## 3. Configurar el login

1. **Authentication → Sign In / Providers**: deja activado **Allow new users to sign up**.
2. En **Email**: déjalo activado y apaga **Confirm email** (el correo gratis de Supabase solo manda ~2 por hora).
3. Cada persona crea su cuenta en la app con **Crear cuenta**. Solo funciona si su correo ya está en **Participantes** (lo controla el trigger `solo_inscritos` de `schema.sql`), así que primero agrégala tú.

## 4. Conectar la página con Supabase

1. **Project Settings → API** (puede aparecer como *Data API* o *API Keys*).
2. Copia la **Project URL** y la llave **anon public** (o *publishable*).
3. Pégalas en `config.js`:

```js
window.RETO_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi..."
};
```

Esa llave es pública por diseño y está bien que quede en la página. Las reglas de `schema.sql` deciden quién ve y cambia qué. **Nunca** uses la llave `service_role`.

## 5. Publicar en GitHub Pages

1. En GitHub → *New repository* → nombre `challenge` → **Public** (Pages gratis requiere repo público; no contiene datos, solo la página).
2. *Add file → Upload files* → sube `index.html`, `app.js` y `config.js` → *Commit*.
3. **Settings → Pages** → *Source: Deploy from a branch* → `main` / `/ (root)` → *Save*.
4. En 1–2 minutos queda en: `https://kats28.github.io/challenge/`

Luego, en Supabase → **Authentication → URL Configuration** → **Site URL**: pega ese link. Sirve para que el correo de "Olvidé mi contraseña" regrese a la app.

## 6. Agregar al equipo e invitarlos

1. Entra a la app con tu correo y contraseña.
2. Pestaña **Participantes** → agrega a cada persona con nombre, **el correo con el que va a entrar**, sexo y estatura.
3. Mándales el link: escriben su correo y una contraseña y tocan **Crear cuenta**.

---

## Quién puede hacer qué

| | Participante | Admin |
|---|---|---|
| Ver ranking, constancia y mediciones de todos | ✓ | ✓ |
| Registrar y corregir sus propias semanas y mediciones | ✓ | ✓ |
| Cambiar datos de otra persona | — | ✓ |
| Agregar, editar o quitar participantes | — | ✓ |

Alguien que tenga cuenta pero no esté en la lista de participantes no ve nada. Puedes marcar a otra persona como admin al editarla.

## Bueno saber

- **Pausa por inactividad:** los proyectos gratis de Supabase se pausan si pasan 7 días sin uso. Con registros semanales no debería pasar; si pasa, entra a Supabase y presiona *Restore*.
- **Cambiar metas o puntos:** están al inicio de `app.js` (`W`, `GOAL_SESS`, `GOAL_STEPS`). Edita, vuelve a subir el archivo a GitHub y listo.
- **Respaldo:** Supabase → *Table Editor* → cada tabla → *Export to CSV*.
- La app se actualiza sola cada minuto para mostrar lo que registren los demás.
