(() => {
  "use strict";

  const config = window.PARCHE_CONFIG || {};

  const configured =
    config.SUPABASE_URL &&
    config.SUPABASE_ANON_KEY &&
    !config.SUPABASE_URL.includes("PEGA_AQUI") &&
    !config.SUPABASE_ANON_KEY.includes("PEGA_AQUI");

  const loginShell = document.querySelector("#login-shell");
  const app = document.querySelector("#admin-app");
  const loginForm = document.querySelector("#login-form");
  const loginMessage = document.querySelector("#login-message");

  if (!configured || !window.supabase) {
    loginMessage.textContent =
      "Primero configura config.js con los datos de tu proyecto Supabase. Consulta LEEME.txt.";
    loginForm.querySelector("button").disabled = true;
    return;
  }

  const db = window.supabase.createClient(
    config.SUPABASE_URL,
    config.SUPABASE_ANON_KEY
  );

  const byId = id => document.getElementById(id);

  const form = byId("event-form");
  const list = byId("events-list");
  const emptyState = byId("empty-state");
  const search = byId("event-search");
  const message = byId("form-message");
  const posterInput = byId("event-poster");
  const deleteDialog = byId("delete-dialog");
  const confirmDelete = byId("confirm-delete");

  let events = [];
  let editingId = null;
  let pendingDeleteId = null;
  let posterData = "";
  let posterReadPromise = Promise.resolve("");

  byId("current-year").textContent = String(
    new Date().getFullYear()
  );

  const esc = value =>
    String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch]));

  const prettyDate = date => {
    if (!date) return "FECHA POR CONFIRMAR";

    const d = new Date(date + "T12:00:00");

    return Number.isNaN(d.getTime())
      ? date
      : new Intl.DateTimeFormat("es-ES", {
          day: "2-digit",
          month: "short",
          year: "numeric"
        }).format(d).toUpperCase();
  };

  const headerActions = document.querySelector(".header-actions");

  const logout = document.createElement("button");
  logout.className = "button button-quiet";
  logout.type = "button";
  logout.textContent = "Cerrar sesión";
  logout.hidden = true;
  headerActions.appendChild(logout);

  logout.addEventListener("click", async () => {
    const { error } = await db.auth.signOut();

    if (error) {
      console.error("Error al cerrar sesión:", error);
      message.textContent = "No se ha podido cerrar la sesión.";
    }
  });

  async function setSession(session) {
    const logged = Boolean(session);

    loginShell.hidden = logged;
    app.hidden = !logged;
    logout.hidden = !logged;

    if (logged) {
      await loadEvents();
    } else {
      events = [];
      list.innerHTML = "";
    }
  }

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    loginMessage.textContent = "Comprobando acceso…";

    const { error } = await db.auth.signInWithPassword({
      email: byId("login-email").value.trim(),
      password: byId("login-password").value
    });

    if (error) {
      console.error("Error de inicio de sesión:", error);
      loginMessage.textContent =
        "No se ha podido iniciar sesión. Comprueba el correo y la contraseña autorizados.";
      return;
    }

    loginMessage.textContent = "";
  });

  db.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => setSession(session), 0);
  });

  async function loadEvents() {
    message.textContent = "Cargando eventos…";

    const { data, error } = await db
      .from("events")
      .select("*")
      .order("event_date", { ascending: true });

    if (error) {
      console.error("Error al cargar eventos:", error);
      message.textContent =
        "No se pudieron cargar los eventos. Revisa la conexión y las políticas RLS de Supabase.";
      return false;
    }

    events = data || [];
    logout.hidden = false;
    renderEvents();
    message.textContent = "";

    return true;
  }

  function renderEvents() {
    byId("stat-total").textContent = events.length;

    byId("stat-published").textContent =
      events.filter(e => e.published).length;

    byId("stat-drafts").textContent =
      events.filter(e => !e.published).length;

    const query = (search.value || "")
      .trim()
      .toLocaleLowerCase("es");

    const filtered = events.filter(e =>
      [e.title, e.city, e.venue, e.description]
        .join(" ")
        .toLocaleLowerCase("es")
        .includes(query)
    );

    list.innerHTML = "";
    emptyState.hidden = filtered.length > 0;

    if (!filtered.length) {
      emptyState.querySelector("h3").textContent = query
        ? "NO HAY RESULTADOS"
        : "TODAVÍA NO HAY EVENTOS";

      emptyState.querySelector("p").textContent = query
        ? "Prueba con otro nombre, ciudad o sala."
        : "Crea tu primer evento y aparecerá aquí para que puedas revisarlo.";

      emptyState.querySelector("a").hidden = Boolean(query);
      return;
    }

    emptyState.querySelector("h3").textContent =
      "TODAVÍA NO HAY EVENTOS";

    emptyState.querySelector("p").textContent =
      "Crea tu primer evento y aparecerá aquí para que puedas revisarlo.";

    emptyState.querySelector("a").hidden = false;

    filtered.forEach(event => {
      const row = document.createElement("article");
      row.className = "event-row";

      const poster = event.poster_data
        ? `<img class="poster-thumb" src="${esc(event.poster_data)}" alt="Cartel de ${esc(event.title)}">`
        : '<div class="poster-thumb poster-placeholder" aria-hidden="true">P!</div>';

      const location = [event.venue, event.city]
        .filter(Boolean)
        .map(esc)
        .join(" · ");

      row.innerHTML = `
        ${poster}
        <div class="event-info">
          <span class="event-date">
            ${esc(prettyDate(event.event_date))}${event.event_time ? " · " + esc(event.event_time) : ""}
          </span>
          <h3>${esc(event.title)}</h3>
          <p>${location || "Ubicación por confirmar"}</p>
          <div class="event-meta">
            <span class="status ${event.published ? "published" : ""}">
              ${event.published ? "PUBLICADO" : "BORRADOR"}
            </span>
            ${event.ticket_url ? '<span class="status">ENLACE AÑADIDO</span>' : ""}
          </div>
        </div>
        <div class="event-actions">
          <button class="small-action" type="button" data-edit="${esc(event.id)}">EDITAR</button>
          <button class="small-action delete" type="button" data-delete="${esc(event.id)}">ELIMINAR</button>
        </div>
      `;

      list.appendChild(row);
    });
  }

  posterInput.addEventListener("change", () => {
    const file = posterInput.files && posterInput.files[0];

    if (!file) {
      posterData = "";
      posterReadPromise = Promise.resolve("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      message.textContent = "Selecciona un archivo de imagen.";
      posterInput.value = "";
      posterData = "";
      posterReadPromise = Promise.resolve("");
      return;
    }

    if (file.size > 500 * 1024) {
      message.textContent =
        "El cartel supera 500 KB. Reduce el tamaño para esta demo.";

      posterInput.value = "";
      posterData = "";
      posterReadPromise = Promise.resolve("");
      return;
    }

    posterReadPromise = new Promise(resolve => {
      const reader = new FileReader();

      reader.onload = () => {
        posterData = String(reader.result || "");
        resolve(posterData);
      };

      reader.onerror = () => {
        posterData = "";
        message.textContent = "No se ha podido leer el cartel.";
        resolve("");
      };

      reader.readAsDataURL(file);
    });
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const title = byId("event-title").value.trim();
    const date = byId("event-date").value;
    const city = byId("event-city").value.trim();
    const ticketUrl = byId("event-ticket-url").value.trim();

    if (!title || !date || !city) {
      message.textContent =
        "Completa el nombre, la fecha y la ciudad.";
      return;
    }

    if (ticketUrl) {
      try {
        const url = new URL(ticketUrl);

        if (!["http:", "https:"].includes(url.protocol)) {
          throw new Error("Protocolo no válido");
        }
      } catch {
        message.textContent =
          "Introduce un enlace válido que empiece por https:// o http://.";
        return;
      }
    }

    const submitButton =
      byId("event-form").querySelector('button[type="submit"]');

    submitButton.disabled = true;

    try {
      message.textContent = "Guardando evento…";

      // Espera a que termine de cargarse el cartel, si se ha seleccionado uno.
      if (posterInput.files && posterInput.files.length > 0) {
        await posterReadPromise;

        if (!posterData) {
          message.textContent =
            "No se ha podido leer el cartel. Vuelve a seleccionarlo o quítalo.";
          return;
        }
      }

      const existing = events.find(item => item.id === editingId);

      if (editingId && !existing) {
        message.textContent =
          "No se encuentra el evento que intentas editar. Recarga la lista e inténtalo de nuevo.";
        return;
      }

      const payload = {
        title,
        event_date: date,
        event_time: byId("event-time").value || null,
        city,
        venue: byId("event-venue").value.trim(),
        description: byId("event-description").value.trim(),
        ticket_url: ticketUrl || null,
        poster_data: posterData || existing?.poster_data || null,
        published: byId("event-published").checked,
        updated_at: new Date().toISOString()
      };

      let result;

      if (editingId) {
        // Actualiza únicamente el evento que se está editando.
        result = await db
          .from("events")
          .update(payload)
          .eq("id", editingId)
          .select("id");
      } else {
        // Crea un nuevo evento.
        result = await db
          .from("events")
          .insert(payload);
      }

      if (result.error) {
        console.error("Error de Supabase al guardar:", result.error);

        message.textContent =
          "No se pudo guardar. Revisa la sesión, los permisos RLS y los campos de la tabla events.";

        return;
      }

      // Supabase debe devolver la fila actualizada.
      if (editingId && (!result.data || result.data.length === 0)) {
        console.error(
          "Supabase no devolvió ninguna fila actualizada. Comprueba las políticas RLS de UPDATE y SELECT."
        );

        message.textContent =
          "Supabase no confirma la modificación. Revisa los permisos UPDATE y SELECT de la tabla events.";

        return;
      }

      const wasEditing = Boolean(editingId);

      // Recarga desde Supabase para comprobar los datos guardados.
      const loaded = await loadEvents();

      if (!loaded) {
        message.textContent =
          "La operación se envió, pero no se pudo comprobar la lista actualizada. Recarga el panel antes de repetirla.";
        return;
      }

      form.reset();
      posterData = "";
      posterReadPromise = Promise.resolve("");
      editingId = null;

      byId("event-published").checked = false;

      submitButton.innerHTML =
        'GUARDAR EVENTO <span>↗</span>';

      message.textContent = wasEditing
        ? "Cambios guardados y lista actualizada desde Supabase."
        : "Evento creado y lista actualizada desde Supabase.";

      byId("mis-eventos").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

    } catch (error) {
      console.error("Error inesperado al guardar:", error);

      message.textContent =
        "Ha ocurrido un error al guardar. Revisa la conexión e inténtalo de nuevo.";

    } finally {
      submitButton.disabled = false;
    }
  });

  form.addEventListener("reset", () => {
    setTimeout(() => {
      editingId = null;
      posterData = "";
      posterReadPromise = Promise.resolve("");
      message.textContent = "";

      byId("event-form").querySelector('button[type="submit"]').innerHTML =
        'GUARDAR EVENTO <span>↗</span>';
    }, 0);
  });

  list.addEventListener("click", event => {
    const edit = event.target.closest("[data-edit]");
    const del = event.target.closest("[data-delete]");

    if (edit) {
      const item = events.find(e => String(e.id) === edit.dataset.edit);

      if (!item) {
        message.textContent =
          "No se encuentra el evento. Recarga la lista e inténtalo de nuevo.";
        return;
      }

      editingId = item.id;

      byId("event-title").value = item.title || "";
      byId("event-date").value = item.event_date || "";
      byId("event-time").value = item.event_time || "";
      byId("event-city").value = item.city || "";
      byId("event-venue").value = item.venue || "";
      byId("event-description").value = item.description || "";
      byId("event-ticket-url").value = item.ticket_url || "";
      byId("event-published").checked = Boolean(item.published);

      // Conserva el cartel existente si no seleccionas uno nuevo.
      posterData = "";
      posterReadPromise = Promise.resolve("");

      posterInput.value = "";

      byId("event-form").querySelector('button[type="submit"]').innerHTML =
        'GUARDAR CAMBIOS <span>↗</span>';

      message.textContent =
        "Editando evento. Si no seleccionas otro cartel, se conservará el actual.";

      byId("crear-evento").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }

    if (del) {
      pendingDeleteId = del.dataset.delete;

      if (typeof deleteDialog.showModal === "function") {
        deleteDialog.showModal();
      } else if (confirm("¿Eliminar este evento?")) {
        deleteEvent();
      }
    }
  });

  async function deleteEvent() {
    if (!pendingDeleteId) return;

    const id = pendingDeleteId;
    pendingDeleteId = null;

    message.textContent = "Eliminando evento…";

    const { error } = await db
      .from("events")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error al eliminar evento:", error);
      message.textContent =
        "No se pudo eliminar. Revisa los permisos DELETE de Supabase.";
      return;
    }

    const loaded = await loadEvents();

    if (loaded) {
      message.textContent = "Lista actualizada desde Supabase.";
    }
  }

  confirmDelete.addEventListener("click", event => {
    event.preventDefault();

    deleteEvent();

    if (typeof deleteDialog.close === "function") {
      deleteDialog.close();
    }
  });

  deleteDialog.addEventListener("close", () => {
    pendingDeleteId = null;
  });

  search.addEventListener("input", renderEvents);

  db.auth.getSession().then(({ data, error }) => {
    if (error) {
      console.error("Error al comprobar la sesión:", error);
      loginMessage.textContent =
        "No se ha podido comprobar la sesión. Recarga la página.";
      return;
    }

    setSession(data.session);
  });
})();