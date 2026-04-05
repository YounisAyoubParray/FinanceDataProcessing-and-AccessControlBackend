
const registerForm = document.getElementById("registerForm");
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(registerForm);
    const email = formData.get("email");
    const password = formData.get("password");
    const role = formData.get("role");
    const res = await fetch("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role })
    });
    const data = await res.json();
    document.getElementById("message").innerText = JSON.stringify(data);
  });
}


const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(loginForm);
    const email = formData.get("email");
    const password = formData.get("password");
    const res = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.token || res.ok) {
      window.location.href = "/dashboard";
    } else {
      document.getElementById("message").innerText = JSON.stringify(data);
    }
  });
}

const recordForm = document.getElementById("recordForm");
if (recordForm) {
  recordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(recordForm);
    const netBalanceEl = document.getElementById("PersonalNet");
    const record = {
      amount: Number(formData.get("amount")),
      type: formData.get("type"),
      category: formData.get("category"),
      notes: formData.get("notes"),
      netBalance: netBalanceEl ? Number(netBalanceEl.innerText) : 0
    };
    const res = await fetch("/records", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify(record)
    });
    const data = await res.json();
    alert(JSON.stringify(data));
  });
}

const loadDashboardData = async () => {
    const res = await fetch("/api/dashboard", {
      credentials: "include"
    });
    const data = await res.json();
    const dashboardData = document.getElementById("dashboardData");
    if (dashboardData) {
      dashboardData.innerText = JSON.stringify(data, null, 2);
    }

    if (data.totals) {
      const totalIncomeEl = document.getElementById("totalIncome");
      const totalExpenseEl = document.getElementById("totalExpense");
      const totalNetEl = document.getElementById("totalNet");
      const totalsScopeEl = document.getElementById("totalsScope");
      const personalNetEl = document.getElementById("PersonalNet");

      if (totalIncomeEl) totalIncomeEl.innerText = String(data.totals.totalIncome ?? 0);
      if (totalExpenseEl) totalExpenseEl.innerText = String(data.totals.totalExpense ?? 0);
      if (totalNetEl) totalNetEl.innerText = String(data.totals.net ?? 0);
      if (totalsScopeEl) totalsScopeEl.innerText = data.totals.scope ?? "-";
      if (personalNetEl) personalNetEl.innerText = String(data.personalTotals?.net ?? data.totals?.net ?? 0);
    }
};

document.addEventListener("DOMContentLoaded", () => {
  const loadDashboardBtn = document.getElementById("loadDashboard");
  const dashboardData = document.getElementById("dashboardData");

  
  if (!loadDashboardBtn || !dashboardData) return;

  loadDashboardBtn.addEventListener("click", loadDashboardData);
});

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    window.location.href = "/index.html";
  });
}

const loadUsersBtn = document.getElementById("loadUsersBtn");
if (loadUsersBtn) {
  loadUsersBtn.addEventListener("click", async () => {
    const res = await fetch("/admin/users", {
      credentials: "include"
    });
    const data = await res.json();
    const usersData = document.getElementById("usersData");
    if (usersData) {
      usersData.innerText = JSON.stringify(data, null, 2);
    }
  });
}

const deleteRecordBtn = document.getElementById("deleteRecordBtn");
if (deleteRecordBtn) {
  deleteRecordBtn.addEventListener("click", async () => {
    const recordId = document.getElementById("deleteRecordId")?.value;
    if (!recordId) {
      alert("Please enter a record ID");
      return;
    }

    const res = await fetch(`/admin/records/${recordId}`, {
      method: "DELETE",
      credentials: "include"
    });
    const data = await res.json();
    alert(JSON.stringify(data));
  });
}

const deleteUserBtn = document.getElementById("deleteUserBtn");
if (deleteUserBtn) {
  deleteUserBtn.addEventListener("click", async () => {
    const userId = document.getElementById("deleteUserId")?.value;
    if (!userId) {
      alert("Please enter a user ID");
      return;
    }

    const res = await fetch(`/admin/users/${userId}`, {
      method: "DELETE",
      credentials: "include"
    });
    const data = await res.json();
    alert(JSON.stringify(data));
  });
}


