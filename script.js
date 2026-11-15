
// =====================================================
// BLACK CROWN MANAGEMENT INTERNATIONAL
// Script principal Supabase - Version renforcée
// =====================================================

const SUPABASE_URL = "https://hwtrygjchwkqxgcxdeak.supabase.co";
const SUPABASE_KEY = "sb_publishable_Cpsd8D0cSKUHsXJaLVyCMg_YUGr7LLU";

// Vérifier que Supabase est bien chargé avant de lancer le site
if (!window.supabase || typeof window.supabase.createClient !== "function") {
  console.error("La bibliothèque Supabase n'a pas été chargée.");

  document.addEventListener("DOMContentLoaded", () => {
    const adminMessage = document.getElementById("adminMessage");
    const talentMessage = document.getElementById("talentAuthMessage");

    const errorText =
      "Le service de connexion ne s'est pas chargé. Vérifie ta connexion Internet et actualise la page.";

    if (adminMessage) adminMessage.textContent = errorText;
    if (talentMessage) talentMessage.textContent = errorText;
  });

  throw new Error("Supabase indisponible : script principal arrêté.");
}

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const $ = id => document.getElementById(id);

let currentTalent = null;
let currentTalentUser = null;
let isAdministrator = false;
let adminLoginInProgress = false;

// =====================================================
// OUTILS GÉNÉRAUX
// =====================================================

function message(id, text) {
  const element = $(id);
  if (element) element.textContent = text;
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function mediaHTML(url, type) {
  if (!url) return "";

  const safeURL = escapeHTML(url);

  if (type === "video") {
    return `<video class="media-video" controls playsinline src="${safeURL}"></video>`;
  }

  return `<img src="${safeURL}" alt="Publication BLACK CROWN">`;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("fr-FR");
}

async function uploadMedia(file, userId) {
  if (!file || file.size === 0) {
    return { url: null, type: null };
  }

  const allowedTypes = ["image/", "video/"];

  if (!allowedTypes.some(type => file.type.startsWith(type))) {
    throw new Error("Choisis une image ou une vidéo.");
  }

  const maxSize = 50 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error("Le fichier ne peut pas dépasser 50 Mo.");
  }

  const extension = file.name.split(".").pop().toLowerCase();

  const fileName =
    `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

  const { error } = await supabaseClient.storage
    .from("bc-media")
    .upload(fileName, file, {
      cacheControl: "3600",
      upsert: false
    });

  if (error) throw error;

  const { data } = supabaseClient.storage
    .from("bc-media")
    .getPublicUrl(fileName);

  return {
    url: data.publicUrl,
    type: file.type.startsWith("video/") ? "video" : "image"
  };
}

// =====================================================
// CANDIDATURES PUBLIQUES
// =====================================================

$("applicationForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const values = new FormData(form);

  const application = {
    name: values.get("name").trim(),
    email: values.get("email").trim(),
    domain: values.get("domain"),
    message: values.get("message").trim(),
    status: "En attente"
  };

  message("applicationMessage", "Envoi de ta candidature...");

  try {
    const { error } = await supabaseClient
      .from("applications")
      .insert([application]);

    if (error) throw error;

    form.reset();

    message(
      "applicationMessage",
      "Ta candidature a bien été envoyée. Merci pour ta confiance !"
    );
  } catch (error) {
    console.error(error);
    message(
      "applicationMessage",
      "Erreur lors de l'envoi. Vérifie ta connexion et réessaie."
    );
  }
});

// =====================================================
// AFFICHAGE PUBLIC DES TALENTS
// =====================================================

async function loadPublicTalents() {
  const container = $("dynamicTalents");
  if (!container) return;

  const { data, error } = await supabaseClient
    .from("talents")
    .select("*")
    .eq("is_published", true)
    .eq("account_status", "Actif")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Chargement des talents :", error);
    return;
  }

  container.innerHTML = (data || []).map(talent => `
    <article class="talent-card">
      ${talent.photo_url
        ? `<img src="${escapeHTML(talent.photo_url)}" alt="${escapeHTML(talent.name)}">`
        : ""}
      <div class="talent-info">
        <h3>${escapeHTML(talent.name)}</h3>
        <p><strong>${escapeHTML(talent.domain)}</strong></p>
        <p>${escapeHTML(talent.description || "")}</p>
      </div>
    </article>
  `).join("");
}

// =====================================================
// CRÉATION D'UN COMPTE TALENT
// =====================================================

$("talentSignupForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const values = new FormData(form);

  const fullName = values.get("full_name").trim();
  const email = values.get("email").trim();
  const password = values.get("password");
  const domain = values.get("domain");
  const description = values.get("description") || "";

  message("talentAuthMessage", "Création du compte...");

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          account_type: "talent",
          full_name: fullName,
          domain,
          description
        }
      }
    });

    if (error) throw error;

    form.reset();

    if (data.session) {
      message(
        "talentAuthMessage",
        "Compte créé. Ton profil doit être activé par BLACK CROWN."
      );

      await handleTalentLogin(data.user);
    } else {
      message(
        "talentAuthMessage",
        "Inscription enregistrée. Vérifie tes e-mails pour confirmer ton adresse, puis attends l'activation de ton compte."
      );
    }
  } catch (error) {
    console.error(error);
    message("talentAuthMessage", error.message || "Impossible de créer le compte.");
  }
});

// =====================================================
// CONNEXION TALENT
// =====================================================

$("talentLoginForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const values = new FormData(event.currentTarget);

  message("talentAuthMessage", "Connexion...");

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: values.get("email").trim(),
      password: values.get("password")
    });

    if (error) throw error;

    await handleTalentLogin(data.user);
  } catch (error) {
    console.error(error);
    message("talentAuthMessage", error.message || "Erreur de connexion.");
  }
});

async function handleTalentLogin(user) {
  if (!user) return;

  const { data: talent, error } = await supabaseClient
    .from("talents")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !talent) {
    console.error("Profil talent introuvable :", error);
    message(
      "talentAuthMessage",
      "Aucun profil talent trouvé. Contacte BLACK CROWN."
    );
    return;
  }

  currentTalent = talent;
  currentTalentUser = user;

  if ($("talentAuth")) $("talentAuth").hidden = true;
  if ($("talentDashboard")) $("talentDashboard").hidden = false;

  message(
    "talentAccountStatus",
    `Statut du compte : ${talent.account_status || "En attente"}`
  );

  $("profileName").value = talent.name || "";
  $("profileDomain").value = talent.domain || "Autre";
  $("profileDescription").value = talent.description || "";
  $("profilePhoto").value = talent.photo_url || "";

  const active = talent.account_status === "Actif";

  $("talentProfileForm")
    .querySelectorAll("input,select,textarea,button")
    .forEach(element => element.disabled = !active);

  $("talentPostForm")
    .querySelectorAll("input,textarea,button")
    .forEach(element => element.disabled = !active);

  if (!active) {
    message(
      "talentPostMessage",
      "Ton compte attend l'activation de l'administrateur."
    );
  } else {
    message("talentPostMessage", "");
  }

  await loadMyTalentPosts();
}

// =====================================================
// MODIFICATION DU PROFIL TALENT
// =====================================================

$("talentProfileForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentTalent || !currentTalentUser) return;

  const updates = {
    name: $("profileName").value.trim(),
    domain: $("profileDomain").value,
    description: $("profileDescription").value.trim(),
    photo_url: $("profilePhoto").value.trim()
  };

  const { data, error } = await supabaseClient
    .from("talents")
    .update(updates)
    .eq("id", currentTalent.id)
    .eq("user_id", currentTalentUser.id)
    .select()
    .maybeSingle();

  if (error) {
    console.error(error);
    alert("Impossible de modifier ton profil : " + error.message);
    return;
  }

  if (data) currentTalent = data;

  alert("Ton profil a été mis à jour.");
  await loadPublicTalents();
});

// =====================================================
// PUBLICATION PAR UN TALENT
// =====================================================

$("talentPostForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentTalent || !currentTalentUser) {
    message("talentPostMessage", "Connecte-toi à ton compte talent.");
    return;
  }

  if (currentTalent.account_status !== "Actif") {
    message("talentPostMessage", "Ton compte n'est pas encore activé.");
    return;
  }

  const form = event.currentTarget;
  const values = new FormData(form);
  const file = values.get("media");

  try {
    message("talentPostMessage", "Envoi de ta publication...");

    const uploaded = await uploadMedia(file, currentTalentUser.id);

    const publication = {
      talent_id: currentTalent.id,
      user_id: currentTalentUser.id,
      title: values.get("title").trim(),
      description: values.get("description").trim(),
      media_url: uploaded.url,
      media_type: uploaded.type || "image",
      status: "En attente"
    };

    const { error } = await supabaseClient
      .from("talent_posts")
      .insert([publication]);

    if (error) throw error;

    form.reset();

    message(
      "talentPostMessage",
      "Publication envoyée. Elle sera visible après validation."
    );

    await loadMyTalentPosts();
  } catch (error) {
    console.error(error);
    message("talentPostMessage", "Erreur : " + error.message);
  }
});

// =====================================================
// PUBLICATIONS PERSONNELLES DU TALENT
// =====================================================

async function loadMyTalentPosts() {
  if (!currentTalentUser) return;

  const container = $("myTalentPosts");
  if (!container) return;

  const { data, error } = await supabaseClient
    .from("talent_posts")
    .select("*")
    .eq("user_id", currentTalentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML =
      `<p class="empty-message">Impossible de charger les publications.</p>`;
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML =
      `<p class="empty-message">Tu n'as pas encore envoyé de publication.</p>`;
    return;
  }

  container.innerHTML = data.map(post => `
    <article>
      <h4>${escapeHTML(post.title)}</h4>
      <p>${escapeHTML(post.description || "")}</p>
      ${mediaHTML(post.media_url, post.media_type)}
      <p>Statut : <span class="status-tag">${escapeHTML(post.status)}</span></p>
      <p>Envoyée le ${formatDate(post.created_at)}</p>
      ${post.status === "En attente"
        ? `<button type="button" onclick="deleteMyPost(${post.id})">Supprimer</button>`
        : ""}
    </article>
  `).join("");
}

window.deleteMyPost = async id => {
  if (!currentTalentUser) return;
  if (!confirm("Supprimer cette publication ?")) return;

  const { error } = await supabaseClient
    .from("talent_posts")
    .delete()
    .eq("id", id)
    .eq("user_id", currentTalentUser.id);

  if (error) {
    alert("Suppression impossible : " + error.message);
    return;
  }

  await loadMyTalentPosts();
};

// =====================================================
// DÉCONNEXION TALENT
// =====================================================

$("talentLogout")?.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();

  currentTalent = null;
  currentTalentUser = null;

  $("talentDashboard").hidden = true;
  $("talentAuth").hidden = false;
  $("talentLoginForm").reset();

  message("talentAuthMessage", "Tu es déconnecté.");
});

// =====================================================
// CONNEXION ADMINISTRATEUR - RENFORCÉE
// =====================================================

async function handleAdminLogin() {
  if (adminLoginInProgress) return;

  const email = $("adminEmail")?.value.trim() || "";
  const password = $("adminPassword")?.value || "";
  const button = $("adminLoginBtn");

  if (!email || !password) {
    message("adminMessage", "Entre ton adresse e-mail et ton mot de passe.");
    return;
  }

  if (!navigator.onLine) {
    message("adminMessage", "Aucune connexion Internet. Vérifie ton réseau.");
    return;
  }

  adminLoginInProgress = true;

  if (button) {
    button.disabled = true;
    button.textContent = "CONNEXION...";
  }

  message("adminMessage", "Connexion en cours...");

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    const { data: adminResult, error: adminError } = await supabaseClient
      .rpc("is_admin");

    if (adminError) {
      console.error("Vérification administrateur :", adminError);
      await supabaseClient.auth.signOut();

      throw new Error(
        "Impossible de vérifier les droits administrateur. Réessaie."
      );
    }

    if (adminResult !== true) {
      await supabaseClient.auth.signOut();

      throw new Error(
        "Accès refusé : ce compte n'est pas administrateur."
      );
    }

    isAdministrator = true;

    $("adminLogin").hidden = true;
    $("adminDashboard").hidden = false;

    message("adminMessage", "");

    await loadAdminDashboard();

    $("adminDashboard").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  } catch (error) {
    console.error("Erreur connexion administrateur :", error);

    message(
      "adminMessage",
      error.message || "Une erreur est survenue. Réessaie."
    );

  } finally {
    adminLoginInProgress = false;

    if (button) {
      button.disabled = false;
      button.textContent = "SE CONNECTER";
    }
  }
}

$("adminLoginBtn")?.addEventListener("click", event => {
  event.preventDefault();
  handleAdminLogin();
});

// Permet aussi de se connecter avec la touche Entrée sur téléphone ou ordinateur
["adminEmail", "adminPassword"].forEach(id => {
  $(id)?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAdminLogin();
    }
  });
});

// =====================================================
// CHARGEMENT TABLEAU DE BORD ADMIN
// =====================================================

async function loadAdminDashboard() {
  await Promise.all([
    loadAdminTalents(),
    loadApplications(),
    loadTalentAccounts(),
    loadTalentPostsAdmin(),
    loadFoundationAdmin(),
    loadFoundationPublic()
  ]);
}

// =====================================================
// AJOUT D'UN TALENT PAR L'ADMIN
// =====================================================

$("addTalent")?.addEventListener("click", async () => {
  const name = $("talentName").value.trim();
  const domain = $("talentDomain").value;
  const photo_url = $("talentPhoto").value.trim();
  const description = $("talentDescription").value.trim();

  if (!name || !domain) {
    alert("Indique le nom et le domaine du talent.");
    return;
  }

  const { error } = await supabaseClient
    .from("talents")
    .insert([{
      name,
      domain,
      photo_url,
      description,
      account_status: "Actif",
      is_published: true
    }]);

  if (error) {
    alert("Erreur : " + error.message);
    return;
  }

  $("talentName").value = "";
  $("talentDomain").value = "";
  $("talentPhoto").value = "";
  $("talentDescription").value = "";

  await loadAdminTalents();
  await loadPublicTalents();
});

// =====================================================
// GESTION DES TALENTS EXISTANTS
// =====================================================

async function loadAdminTalents() {
  const container = $("talentsList");
  if (!container) return;

  const { data, error } = await supabaseClient
    .from("talents")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML = `<p>Erreur : ${escapeHTML(error.message)}</p>`;
    return;
  }

  container.innerHTML = (data || []).map(talent => `
    <article>
      <h4>${escapeHTML(talent.name)}</h4>
      <p>${escapeHTML(talent.domain)}</p>
      <p>${escapeHTML(talent.description || "")}</p>
      ${talent.photo_url ? `<img src="${escapeHTML(talent.photo_url)}" alt="">` : ""}
      <p>Compte : ${escapeHTML(talent.account_status || "Actif")}</p>
      <p>Publication publique : ${talent.is_published ? "Oui" : "Non"}</p>
      <button type="button" onclick="toggleTalentPublication(${talent.id},${!talent.is_published})">
        ${talent.is_published ? "Masquer" : "Publier"}
      </button>
      <button type="button" onclick="deleteTalent(${talent.id})">Supprimer</button>
    </article>
  `).join("") || `<p class="empty-message">Aucun talent enregistré.</p>`;
}

window.toggleTalentPublication = async (id, visible) => {
  const { error } = await supabaseClient
    .from("talents")
    .update({ is_published: visible })
    .eq("id", id);

  if (error) return alert(error.message);

  await loadAdminTalents();
  await loadPublicTalents();
};

window.deleteTalent = async id => {
  if (!confirm("Supprimer ce talent ?")) return;

  const { error } = await supabaseClient
    .from("talents")
    .delete()
    .eq("id", id);

  if (error) return alert(error.message);

  await loadAdminTalents();
  await loadPublicTalents();
};

// =====================================================
// ACTIVATION ET SUSPENSION DES COMPTES TALENTS
// =====================================================

async function loadTalentAccounts() {
  const container = $("talentAccountsList");
  if (!container) return;

  const { data, error } = await supabaseClient
    .from("talents")
    .select("*")
    .not("user_id", "is", null)
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML = `<p>Erreur : ${escapeHTML(error.message)}</p>`;
    return;
  }

  container.innerHTML = (data || []).map(talent => `
    <article>
      <h4>${escapeHTML(talent.name)}</h4>
      <p>Domaine : ${escapeHTML(talent.domain)}</p>
      <p>Statut : <span class="status-tag">${escapeHTML(talent.account_status)}</span></p>
      <button type="button" onclick="changeTalentStatus(${talent.id},'Actif')">Activer</button>
      <button type="button" onclick="changeTalentStatus(${talent.id},'Suspendu')">Suspendre</button>
      <button type="button" onclick="changeTalentStatus(${talent.id},'En attente')">Remettre en attente</button>
    </article>
  `).join("") || `<p class="empty-message">Aucun compte talent pour le moment.</p>`;
}

window.changeTalentStatus = async (id, status) => {
  const { error } = await supabaseClient
    .from("talents")
    .update({
      account_status: status,
      is_published: status === "Actif"
    })
    .eq("id", id);

  if (error) {
    alert("Impossible de modifier le compte : " + error.message);
    return;
  }

  await loadTalentAccounts();
  await loadAdminTalents();
  await loadPublicTalents();
};

// =====================================================
// GESTION DES PUBLICATIONS TALENTS PAR L'ADMIN
// =====================================================

async function loadTalentPostsAdmin() {
  const container = $("talentPostsAdmin");
  if (!container) return;

  const { data, error } = await supabaseClient
    .from("talent_posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML = `<p>Erreur : ${escapeHTML(error.message)}</p>`;
    return;
  }

  container.innerHTML = (data || []).map(post => `
    <article>
      <h4>${escapeHTML(post.title)}</h4>
      <p>${escapeHTML(post.description || "")}</p>
      ${mediaHTML(post.media_url, post.media_type)}
      <p>Statut : <span class="status-tag">${escapeHTML(post.status)}</span></p>
      <p>Publication du ${formatDate(post.created_at)}</p>
      <button type="button" onclick="moderateTalentPost(${post.id},'Validée')">Valider</button>
      <button type="button" onclick="moderateTalentPost(${post.id},'Refusée')">Refuser</button>
      <button type="button" onclick="deleteTalentPost(${post.id})">Supprimer</button>
    </article>
  `).join("") || `<p class="empty-message">Aucune publication à traiter.</p>`;
}

window.moderateTalentPost = async (id, status) => {
  const { error } = await supabaseClient
    .from("talent_posts")
    .update({ status })
    .eq("id", id);

  if (error) return alert(error.message);

  await loadTalentPostsAdmin();
  await loadFoundationPublic();
};

window.deleteTalentPost = async id => {
  if (!confirm("Supprimer cette publication ?")) return;

  const { error } = await supabaseClient
    .from("talent_posts")
    .delete()
    .eq("id", id);

  if (error) return alert(error.message);

  await loadTalentPostsAdmin();
};

// =====================================================
// STATISTIQUES ET CANDIDATURES
// =====================================================

$("loadApplications")?.addEventListener("click", loadApplications);

async function loadApplications() {
  const container = $("applicationsList");
  if (!container) return;

  const { data, error } = await supabaseClient
    .from("applications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML = `<p>Erreur : ${escapeHTML(error.message)}</p>`;
    return;
  }

  const applications = data || [];

  const accepted = applications.filter(a => a.status === "Acceptée").length;
  const refused = applications.filter(a => a.status === "Refusée").length;
  const pending = applications.filter(
    a => !a.status || a.status === "En attente"
  ).length;

  $("totalCandidatures").textContent = applications.length;
  $("totalAcceptees").textContent = accepted;
  $("totalRefusees").textContent = refused;
  $("totalAttente").textContent = pending;

  const domains = {};

  applications.forEach(application => {
    const domain = application.domain || "Autre";
    domains[domain] = (domains[domain] || 0) + 1;
  });

  $("domainesList").innerHTML = Object.entries(domains)
    .map(([domain, count]) => {
      const percentage = applications.length
        ? Math.round(count / applications.length * 100)
        : 0;

      return `
        <div class="stat-domaine">
          <div class="stat-domaine-entete">
            <span>${escapeHTML(domain)}</span>
            <strong>${count} (${percentage}%)</strong>
          </div>
          <div class="stat-barre-fond">
            <div class="stat-barre" style="width:${percentage}%"></div>
          </div>
        </div>
      `;
    }).join("") || `<p>Aucune candidature.</p>`;

  container.innerHTML = applications.map(application => `
    <article>
      <h4>${escapeHTML(application.name)}</h4>
      <p>E-mail : ${escapeHTML(application.email)}</p>
      <p>Domaine : ${escapeHTML(application.domain)}</p>
      <p>${escapeHTML(application.message)}</p>
      <p>Statut : <span class="status-tag">${escapeHTML(application.status || "En attente")}</span></p>
      <button type="button" onclick="updateApplicationStatus(${application.id},'Acceptée')">Accepter</button>
      <button type="button" onclick="updateApplicationStatus(${application.id},'Refusée')">Refuser</button>
      <a class="btn" href="mailto:${encodeURIComponent(application.email)}">Contacter</a>
      <button type="button" onclick="deleteApplication(${application.id})">Supprimer</button>
    </article>
  `).join("") || `<p class="empty-message">Aucune candidature reçue.</p>`;
}

window.updateApplicationStatus = async (id, status) => {
  const { error } = await supabaseClient
    .from("applications")
    .update({ status })
    .eq("id", id);

  if (error) return alert("Erreur : " + error.message);

  await loadApplications();
};

window.deleteApplication = async id => {
  if (!confirm("Supprimer définitivement cette candidature ?")) return;

  const { error } = await supabaseClient
    .from("applications")
    .delete()
    .eq("id", id);

  if (error) return alert("Suppression impossible : " + error.message);

  await loadApplications();
};

// =====================================================
// FOUNDATION : AJOUT DE PROJETS ET DONS
// =====================================================

$("foundationForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const values = new FormData(form);

  try {
    message("foundationMessage", "Enregistrement en cours...");

    const file = values.get("media");
    const uploaded = await uploadMedia(file, "foundation");

    const post = {
      category: values.get("category"),
      title: values.get("title").trim(),
      description: values.get("description").trim(),
      donor_name: values.get("donor_name").trim() || null,
      donation_amount: values.get("donation_amount").trim() || null,
      media_url: uploaded.url,
      media_type: uploaded.type || "image",
      is_published: true
    };

    const { error } = await supabaseClient
      .from("foundation_posts")
      .insert([post]);

    if (error) throw error;

    form.reset();

    message(
      "foundationMessage",
      "Publication ajoutée à BLACK CROWN FOUNDATION."
    );

    await loadFoundationAdmin();
    await loadFoundationPublic();
  } catch (error) {
    console.error(error);
    message("foundationMessage", "Erreur : " + error.message);
  }
});

// =====================================================
// AFFICHAGE PUBLIC FOUNDATION
// =====================================================

async function loadFoundationPublic() {
  const container = $("foundationPublic");
  if (!container) return;

  const { data, error } = await supabaseClient
    .from("foundation_posts")
    .select("*")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Foundation publique :", error);
    return;
  }

  container.innerHTML = (data || []).map(post => `
    <article class="publication-card">
      <span class="status-tag">${escapeHTML(post.category)}</span>
      <h3>${escapeHTML(post.title)}</h3>
      <p>${escapeHTML(post.description || "")}</p>
      ${mediaHTML(post.media_url, post.media_type)}
      ${post.donor_name ? `<p>Donateur : ${escapeHTML(post.donor_name)}</p>` : ""}
      ${post.donation_amount ? `<p>Don reçu : ${escapeHTML(post.donation_amount)}</p>` : ""}
      <p>${formatDate(post.created_at)}</p>
    </article>
  `).join("") || `<p class="empty-message">Les actualités de notre fondation seront bientôt disponibles.</p>`;
}

// =====================================================
// GESTION FOUNDATION PAR L'ADMIN
// =====================================================

async function loadFoundationAdmin() {
  const container = $("foundationAdminList");
  if (!container) return;

  const { data, error } = await supabaseClient
    .from("foundation_posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML = `<p>Erreur : ${escapeHTML(error.message)}</p>`;
    return;
  }

  container.innerHTML = (data || []).map(post => `
    <article>
      <h4>${escapeHTML(post.title)}</h4>
      <p>Catégorie : ${escapeHTML(post.category)}</p>
      <p>${escapeHTML(post.description || "")}</p>
      ${mediaHTML(post.media_url, post.media_type)}
      <p>Donateur : ${escapeHTML(post.donor_name || "Non renseigné")}</p>
      <p>Montant : ${escapeHTML(post.donation_amount || "Non renseigné")}</p>
      <p>Publication : ${post.is_published ? "Visible" : "Masquée"}</p>
      <button type="button" onclick="toggleFoundationPost(${post.id},${!post.is_published})">
        ${post.is_published ? "Masquer" : "Publier"}
      </button>
      <button type="button" onclick="deleteFoundationPost(${post.id})">Supprimer</button>
    </article>
  `).join("") || `<p class="empty-message">Aucun projet ou don enregistré.</p>`;
}

window.toggleFoundationPost = async (id, visible) => {
  const { error } = await supabaseClient
    .from("foundation_posts")
    .update({ is_published: visible })
    .eq("id", id);

  if (error) return alert(error.message);

  await loadFoundationAdmin();
  await loadFoundationPublic();
};

window.deleteFoundationPost = async id => {
  if (!confirm("Supprimer cette publication de la fondation ?")) return;

  const { error } = await supabaseClient
    .from("foundation_posts")
    .delete()
    .eq("id", id);

  if (error) return alert(error.message);

  await loadFoundationAdmin();
  await loadFoundationPublic();
};

// =====================================================
// DÉCONNEXION ADMINISTRATEUR
// =====================================================

$("adminLogout")?.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();

  isAdministrator = false;

  $("adminDashboard").hidden = true;
  $("adminLogin").hidden = false;
  $("adminPassword").value = "";

  message("adminMessage", "Déconnexion effectuée.");
});

// =====================================================
// INITIALISATION DU SITE
// =====================================================

async function initializeSite() {
  try {
    await loadPublicTalents();
    await loadFoundationPublic();

    const { data, error } = await supabaseClient.auth.getSession();

    if (error) throw error;

    const user = data?.session?.user;

    if (!user) return;

    const { data: adminResult, error: adminError } = await supabaseClient
      .rpc("is_admin");

    if (!adminError && adminResult === true) {
      isAdministrator = true;

      $("adminLogin").hidden = true;
      $("adminDashboard").hidden = false;

      await loadAdminDashboard();
      return;
    }

    const { data: talent, error: talentError } = await supabaseClient
      .from("talents")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!talentError && talent) {
      await handleTalentLogin(user);
    }
  } catch (error) {
    console.error("Initialisation du site :", error);

    message(
      "adminMessage",
      "Le site n'a pas pu charger toutes les données. Actualise la page."
    );
  }
}

initializeSite();
