// ============================================================
// REINA Controle — frontend (vanilla JS, sem dependências)
// ============================================================

const $ = id => document.getElementById(id);

const money = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dateBR = iso => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const api = (url, opt = {}) =>
  fetch(url, { headers: { "Content-Type": "application/json" }, credentials: "same-origin", ...opt }).then(async r => {
    if (!r.ok) {
      let msg = "Ocorreu um erro.";
      try { msg = (await r.json()).detail || msg; } catch (e) {}
      const err = new Error(msg);
      err.status = r.status;
      throw err;
    }
    return r.status === 204 ? null : r.json();
  });

function esc(s) {
  return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2400);
}

function formObj(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function emptyState(label) {
  return `<div class="empty">
    <svg viewBox="0 0 24 24"><path d="M3 19h18v2H3v-2zM3 8l4 3 5-7 5 7 4-3-2 9H5L3 8z"/></svg>
    <div>${esc(label)}</div>
  </div>`;
}

// ================================================================
// Autenticação
// ================================================================

function toggleAuthForm(which) {
  $("registerForm").classList.toggle("hidden", which !== "register");
  $("loginForm").classList.toggle("hidden", which !== "login");
}

$("registerForm").addEventListener("submit", async e => {
  e.preventDefault();
  const x = formObj(e.target);
  $("registerError").textContent = "";
  try {
    await api("/api/auth/register", { method: "POST", body: JSON.stringify(x) });
    await enterApp();
  } catch (err) {
    $("registerError").textContent = err.message;
  }
});

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const x = formObj(e.target);
  $("loginError").textContent = "";
  try {
    await api("/api/auth/login", { method: "POST", body: JSON.stringify(x) });
    await enterApp();
  } catch (err) {
    $("loginError").textContent = err.message;
  }
});

$("changePasswordForm").addEventListener("submit", async e => {
  e.preventDefault();
  const x = formObj(e.target);
  $("changePasswordError").textContent = "";
  try {
    await api("/api/auth/change-password", { method: "POST", body: JSON.stringify(x) });
    closeModal("passwordModal");
    e.target.reset();
    toast("Senha alterada com sucesso.");
  } catch (err) {
    $("changePasswordError").textContent = err.message;
  }
});

async function logout() {
  await api("/api/auth/logout", { method: "POST" });
  location.reload();
}

function openModal(id) { $(id).classList.remove("hidden"); }
function closeModal(id) { $(id).classList.add("hidden"); }

function renderAccountBadge(user) {
  const badge = $("planBadge");
  const labels = { trial: "Teste grátis", active: "Plano ativo", past_due: "Pagamento pendente", canceled: "Plano cancelado" };
  badge.textContent = labels[user.plan_status] || user.plan_status;
  badge.className = "plan-badge " + user.plan_status;
  $("userName").textContent = user.name;
}

function renderAccountPanel(user) {
  const labels = { trial: "Teste grátis", active: "Ativo", past_due: "Pagamento pendente", canceled: "Cancelado" };
  let trialLine = "";
  if (user.plan_status === "trial" && user.trial_ends_at) {
    const days = Math.max(0, Math.ceil((new Date(user.trial_ends_at) - new Date()) / 86400000));
    trialLine = `<div class="row"><span>Dias restantes de teste</span><span>${days}</span></div>`;
  }
  $("accountInfo").innerHTML = `
    <div class="row"><span>Nome</span><span>${esc(user.name)}</span></div>
    <div class="row"><span>E-mail</span><span>${esc(user.email)}</span></div>
    <div class="row"><span>Situação do plano</span><span>${labels[user.plan_status] || user.plan_status}</span></div>
    ${trialLine}
    <div class="account-note">O pagamento recorrente ainda não está automatizado nesta versão. Depois de receber via Pix/transferência, ative o acesso rodando <code>python admin_tools.py ativar-plano ${esc(user.email)}</code> no servidor — ou integre um gateway (Stripe, Mercado Pago) para automatizar completamente.</div>
  `;
}

async function enterApp() {
  const me = await api("/api/auth/me");
  if (!me.authenticated) {
    $("authOverlay").classList.remove("hidden");
    $("appRoot").classList.add("hidden");
    return;
  }
  $("authOverlay").classList.add("hidden");
  $("appRoot").classList.remove("hidden");
  renderAccountBadge(me.user);
  renderAccountPanel(me.user);
  await refresh();
}

// ================================================================
// Navegação por abas
// ================================================================

function showTab(id, btn) {
  document.querySelectorAll(".tab").forEach(x => x.classList.add("hidden"));
  $(id).classList.remove("hidden");
  document.querySelectorAll(".tabs button").forEach(x => x.classList.remove("active"));
  btn.classList.add("active");
  if (id === "resumoTab") loadResumo();
}

// ================================================================
// Carregamento geral
// ================================================================

async function refresh() {
  const s = await api("/api/summary");
  $("income").textContent = money(s.income);
  $("expense").textContent = money(s.expense);
  $("balance").textContent = money(s.balance);
  $("commitments").textContent = money(s.open_commitments);
  await Promise.all([loadTransactions(), loadCommitments(), loadDebts(), loadGoals()]);
  if (!$("resumoTab").classList.contains("hidden")) loadResumo();
}

// ================================================================
// Utilitário: alterna um form entre modo "criar" e "editar"
// ================================================================

function enterEditMode(form, id, values, submitLabel) {
  form.querySelector('[name="_editId"]').value = id;
  Object.entries(values).forEach(([k, v]) => {
    const field = form.querySelector(`[name="${k}"]`);
    if (!field) return;
    if (field.type === "checkbox") field.checked = !!v;
    else field.value = v ?? "";
  });
  form.querySelector("[data-submit-label]").textContent = "Salvar alterações";
  form.querySelector("[data-cancel-edit]").classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function exitEditMode(form, createLabel) {
  form.reset();
  form.querySelector('[name="_editId"]').value = "";
  form.querySelector("[data-submit-label]").textContent = createLabel;
  form.querySelector("[data-cancel-edit]").classList.add("hidden");
}

document.querySelectorAll("[data-cancel-edit]").forEach(btn => {
  btn.addEventListener("click", () => {
    const form = btn.closest("form");
    const labels = {
      transactionForm: "Registrar", commitmentForm: "Adicionar",
      debtForm: "Adicionar dívida", goalForm: "Criar objetivo",
    };
    exitEditMode(form, labels[form.id]);
  });
});

// ================================================================
// Movimentações
// ================================================================

$("transactionForm").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.target;
  const x = formObj(form);
  const editId = x._editId; delete x._editId;
  x.amount = +x.amount;
  if (editId) {
    await api(`/api/transactions/${editId}`, { method: "PUT", body: JSON.stringify(x) });
    toast("Movimentação atualizada.");
  } else {
    await api("/api/transactions", { method: "POST", body: JSON.stringify(x) });
    toast("Movimentação registrada.");
  }
  exitEditMode(form, "Registrar");
  form.transaction_date.value = new Date().toISOString().slice(0, 10);
  refresh();
});

async function loadTransactions() {
  const a = await api("/api/transactions");
  $("transactions").innerHTML = a.length
    ? a.map(x => `
      <div class="item">
        <div>
          <b>${esc(x.description)}</b>
          <div class="muted">${esc(x.category || "Sem categoria")} · ${dateBR(x.transaction_date)}</div>
        </div>
        <div class="item-actions">
          <span class="amount ${x.kind}">${x.kind === "income" ? "+" : "−"} ${money(x.amount)}</span>
          <button class="small" onclick='editTransaction(${JSON.stringify(x)})'>Editar</button>
          <button class="danger" onclick="del('/api/transactions/${x.id}')">Excluir</button>
        </div>
      </div>`).join("")
    : emptyState("Nenhuma movimentação registrada ainda.");
}

function editTransaction(x) {
  enterEditMode($("transactionForm"), x.id, x);
}

// ================================================================
// Compromissos
// ================================================================

$("commitmentForm").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.target;
  const x = formObj(form);
  const editId = x._editId; delete x._editId;
  x.amount = +x.amount;
  x.recurring = !!form.recurring.checked;
  if (editId) {
    await api(`/api/commitments/${editId}`, { method: "PUT", body: JSON.stringify(x) });
    toast("Compromisso atualizado.");
  } else {
    await api("/api/commitments", { method: "POST", body: JSON.stringify(x) });
    toast("Compromisso adicionado.");
  }
  exitEditMode(form, "Adicionar");
  refresh();
});

async function loadCommitments() {
  const a = await api("/api/commitments");
  $("commitmentsList").innerHTML = a.length
    ? a.map(x => `
      <div class="item">
        <div>
          <b>${esc(x.description)}</b>
          <div class="muted">Vencimento: ${dateBR(x.due_date)}${x.recurring ? '<span class="tag recurring">Recorrente</span>' : ""}${x.paid ? '<span class="tag paid">Pago</span>' : ""}</div>
        </div>
        <div class="item-actions">
          <span class="amount">${money(x.amount)}</span>
          ${x.paid ? `<button class="small" onclick="unpay(${x.id})">Reabrir</button>` : `<button class="small" onclick="pay(${x.id})">Marcar pago</button>`}
          <button class="small" onclick='editCommitment(${JSON.stringify(x)})'>Editar</button>
          <button class="danger" onclick="del('/api/commitments/${x.id}')">Excluir</button>
        </div>
      </div>`).join("")
    : emptyState("Nenhum compromisso cadastrado ainda.");
}

function editCommitment(x) {
  enterEditMode($("commitmentForm"), x.id, { ...x, recurring: !!x.recurring });
}

// ================================================================
// Dívidas
// ================================================================

$("debtForm").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.target;
  const x = formObj(form);
  const editId = x._editId; delete x._editId;
  x.total_amount = +x.total_amount;
  x.installment_amount = +(x.installment_amount || 0);
  x.installments_left = +(x.installments_left || 0);
  if (editId) {
    await api(`/api/debts/${editId}`, { method: "PUT", body: JSON.stringify(x) });
    toast("Dívida atualizada.");
  } else {
    await api("/api/debts", { method: "POST", body: JSON.stringify(x) });
    toast("Dívida registrada.");
  }
  exitEditMode(form, "Adicionar dívida");
  refresh();
});

async function loadDebts() {
  const a = await api("/api/debts");
  $("debtsList").innerHTML = a.length
    ? a.map(x => `
      <div class="item">
        <div>
          <b>${esc(x.creditor)} — ${esc(x.description)}</b>
          <div class="muted">
            ${x.installments_left ? `${x.installments_left} parcelas de ${money(x.installment_amount)}` : "Sem parcelamento"}
            ${x.due_date ? ` · vence ${dateBR(x.due_date)}` : ""}
            ${x.interest_note ? ` · ${esc(x.interest_note)}` : ""}
          </div>
        </div>
        <div class="item-actions">
          <span class="amount">${money(x.total_amount)}</span>
          <button class="small" onclick='editDebt(${JSON.stringify(x)})'>Editar</button>
          <button class="danger" onclick="del('/api/debts/${x.id}')">Excluir</button>
        </div>
      </div>`).join("")
    : emptyState("Nenhuma dívida registrada. Ótimo sinal — ou ainda não chegou a hora de registrar.");
}

function editDebt(x) {
  enterEditMode($("debtForm"), x.id, x);
}

// ================================================================
// Objetivos
// ================================================================

$("goalForm").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.target;
  const x = formObj(form);
  const editId = x._editId; delete x._editId;
  x.target_amount = +x.target_amount;
  x.saved_amount = +(x.saved_amount || 0);
  if (editId) {
    await api(`/api/goals/${editId}`, { method: "PUT", body: JSON.stringify(x) });
    toast("Objetivo atualizado.");
  } else {
    await api("/api/goals", { method: "POST", body: JSON.stringify(x) });
    toast("Objetivo criado.");
  }
  exitEditMode(form, "Criar objetivo");
  refresh();
});

async function loadGoals() {
  const a = await api("/api/goals");
  $("goalsList").innerHTML = a.length
    ? a.map(x => {
        const pct = Math.min(100, ((x.saved_amount / x.target_amount) * 100) || 0);
        return `
        <div class="item">
          <div style="width:100%">
            <b>${esc(x.name)}</b>
            <div class="muted">${money(x.saved_amount)} de ${money(x.target_amount)} · ${pct.toFixed(0)}%${x.target_date ? ` · até ${dateBR(x.target_date)}` : ""}</div>
            <progress value="${pct}" max="100" style="width:100%;margin-top:8px"></progress>
          </div>
          <div class="item-actions">
            <button class="small" onclick='editGoal(${JSON.stringify(x)})'>Editar</button>
            <button class="danger" onclick="del('/api/goals/${x.id}')">Excluir</button>
          </div>
        </div>`;
      }).join("")
    : emptyState("Nenhum objetivo cadastrado ainda.");
}

function editGoal(x) {
  enterEditMode($("goalForm"), x.id, x);
}

// ================================================================
// Resumo (gráfico mensal + categorias)
// ================================================================

async function loadResumo() {
  const [monthly, categories] = await Promise.all([
    api("/api/monthly-summary?months=12"),
    api("/api/category-summary?kind=expense"),
  ]);
  renderMonthlyChart(monthly);
  renderCategoryBreakdown(categories);
}

function renderMonthlyChart(rows) {
  const el = $("monthlyChart");
  if (!rows.length) {
    el.innerHTML = emptyState("Registre movimentações para ver o gráfico mensal.");
    return;
  }
  const W = Math.max(560, rows.length * 70), H = 220, padBottom = 30, padTop = 10;
  const max = Math.max(1, ...rows.map(r => Math.max(r.income, r.expense)));
  const groupW = W / rows.length;
  const barW = Math.min(22, groupW / 3);

  const bars = rows.map((r, i) => {
    const cx = i * groupW + groupW / 2;
    const hInc = (r.income / max) * (H - padBottom - padTop);
    const hExp = (r.expense / max) * (H - padBottom - padTop);
    const [y, m] = r.month.split("-");
    const label = `${m}/${y.slice(2)}`;
    return `
      <rect x="${cx - barW - 3}" y="${H - padBottom - hInc}" width="${barW}" height="${hInc}" rx="3" fill="#B8923F"></rect>
      <rect x="${cx + 3}" y="${H - padBottom - hExp}" width="${barW}" height="${hExp}" rx="3" fill="#6D2748"></rect>
      <text x="${cx}" y="${H - 10}" font-size="10.5" fill="#6E6259" text-anchor="middle" font-family="Poppins, sans-serif">${label}</text>
    `;
  }).join("");

  el.innerHTML = `
    <div class="chart-legend">
      <span><i style="background:#B8923F"></i> Entradas</span>
      <span><i style="background:#6D2748"></i> Despesas</span>
    </div>
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${bars}</svg>
  `;
}

function renderCategoryBreakdown(rows) {
  const el = $("categoryBreakdown");
  if (!rows.length) {
    el.innerHTML = emptyState("Nenhuma despesa registrada ainda.");
    return;
  }
  const max = Math.max(...rows.map(r => r.total));
  el.innerHTML = rows.map(r => `
    <div class="cat-row">
      <div class="cat-head"><b>${esc(r.category)}</b><span>${money(r.total)}</span></div>
      <div class="cat-bar-bg"><div class="cat-bar" style="width:${(r.total / max) * 100}%"></div></div>
    </div>
  `).join("");
}

// ================================================================
// Ações compartilhadas
// ================================================================

async function pay(id) {
  await api(`/api/commitments/${id}/paid`, { method: "PATCH" });
  toast("Compromisso marcado como pago.");
  refresh();
}

async function unpay(id) {
  await api(`/api/commitments/${id}/unpaid`, { method: "PATCH" });
  toast("Compromisso reaberto.");
  refresh();
}

async function del(url) {
  if (confirm("Excluir este registro?")) {
    await api(url, { method: "DELETE" });
    toast("Registro excluído.");
    refresh();
  }
}

// ================================================================
// Inicialização
// ================================================================

$("transactionForm").transaction_date.value = new Date().toISOString().slice(0, 10);
enterApp();
