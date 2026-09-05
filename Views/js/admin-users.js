const API_BASE =
  "http://localhost:5000/api" ||
  "http://localhost:5000/api";
let allUsers = [];

// ========== UTILITY ==========
function showLoading(show) {
  document.getElementById("loadingSpinner").style.display = show
    ? "flex"
    : "none";
  document.getElementById("usersTableBody").innerHTML = "";
  document.getElementById("noUsersMessage").style.display = "none";
}

function renderTable(users) {
  const tbody = document.getElementById("usersTableBody");
  const noMsg = document.getElementById("noUsersMessage");

  if (!users || users.length === 0) {
    tbody.innerHTML = "";
    noMsg.style.display = "block";
    return;
  }
  noMsg.style.display = "none";

  tbody.innerHTML = users
    .map((user) => {
      const roleClass = user.isAdmin ? "badge-admin" : "badge-user";
      const roleText = user.isAdmin ? "Admin" : "User";
      const registered = new Date(user.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

      return `
            <tr>
                <td>
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        ${
                          user.profile_image
                            ? `<img src="${user.profile_image}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">`
                            : `<div style="width:32px;height:32px;border-radius:50%;background:var(--gray-200);display:flex;align-items:center;justify-content:center;color:var(--gray-500);"><i class="fas fa-user"></i></div>`
                        }
                        <span>${escapeHtml(user.name)}</span>
                    </div>
                </td>
                <td>${escapeHtml(user.email)}</td>
                <td>${escapeHtml(user.phone || "—")}</td>
                <td><span class="badge-role ${roleClass}">${roleText}</span></td>
                <td>${registered}</td>
                <td class="user-actions">
                    <i class="fas fa-edit" title="Edit user"></i>
                    <i class="fas fa-trash-alt" title="Delete user"></i>
                </td>
            </tr>
        `;
    })
    .join("");
}

function escapeHtml(unsafe) {
  return unsafe.replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[m],
  );
}

// ========== FETCH USERS (no token) ==========
async function fetchUsers(filterParams = {}) {
  showLoading(true);
  const queryString = new URLSearchParams(filterParams).toString();
  try {
    const response = await fetch(`${API_BASE}/admin/users?${queryString}`);
    const data = await response.json();
    console.log("API response:", data);
    allUsers = data;
    renderTable(allUsers);
  } catch (error) {
    console.error("Fetch error:", error);
    document.getElementById("usersTableBody").innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:red;">Failed to load users. Check console.</td></tr>';
  } finally {
    showLoading(false);
  }
}

// ========== FILTER HANDLERS ==========
function getFilterValues() {
  const date = document.getElementById("filterDate").value;
  const month = document.getElementById("filterMonth").value;
  const year = document.getElementById("filterYear").value;

  const params = {};
  if (date) params.date = date;
  else if (month) params.month = month;
  else if (year) params.year = year;

  return params;
}

document.getElementById("applyFilter").addEventListener("click", () => {
  const params = getFilterValues();
  fetchUsers(params);
});

document.getElementById("resetFilter").addEventListener("click", () => {
  document.getElementById("filterDate").value = "";
  document.getElementById("filterMonth").value = "";
  document.getElementById("filterYear").value = "";
  fetchUsers();
});

// ========== INITIAL LOAD ==========
fetchUsers();
