/* ==========================================================================
   FinTrack Pro - Application Logic
   ========================================================================== */

// --- Global Configuration & State ---
const currencies = {
  USD: { symbol: '$', name: 'USD ($)' },
  EUR: { symbol: '€', name: 'EUR (€)' },
  GBP: { symbol: '£', name: 'GBP (£)' },
  INR: { symbol: '₹', name: 'INR (₹)' },
  JPY: { symbol: '¥', name: 'JPY (¥)' }
};

const categoryIcons = {
  'Food & Dining': '🍔',
  'Shopping': '🛍️',
  'Recharge & Bills': '📱',
  'Petrol & Auto': '🚗',
  'Utilities': '💡',
  'Salary': '💰',
  'Entertainment': '🎬',
  'Other': '🏷️'
};

const defaultCategories = {
  income: ['Salary', 'Other'],
  expense: [
    'Food & Dining', 
    'Shopping', 
    'Recharge & Bills', 
    'Petrol & Auto', 
    'Utilities', 
    'Entertainment', 
    'Other'
  ]
};

// Application State
let state = {
  user: null, // { username: '', name: '', currency: 'USD' }
  transactions: [],
  activeFilter: 'all', // 'all', 'income', 'expense'
  searchQuery: '',
  activePage: 'dashboard' // 'dashboard', 'settings'
};

// Chart.js instance holder
let cashFlowChart = null;

// --- Helper Functions ---
function formatCurrency(amount, currencyCode) {
  const symbol = currencies[currencyCode]?.symbol || '$';
  return `${symbol}${Number(amount).toLocaleString(undefined, { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })}`;
}

function getTodayString() {
  const today = new Date();
  const yyyy = today.getFullYear();
  let mm = today.getMonth() + 1; // Months start at 0
  let dd = today.getDate();

  if (mm < 10) mm = '0' + mm;
  if (dd < 10) dd = '0' + dd;

  return `${yyyy}-${mm}-${dd}`;
}

// --- SweetAlert2 Theme Wrapper & Toast Configuration ---
function getSwalConfig() {
  const isDark = document.body.classList.contains('dark');
  return {
    background: isDark ? '#151c2c' : '#ffffff',
    color: isDark ? '#f8fafc' : '#0f172a',
    confirmButtonColor: isDark ? '#4f46e5' : '#000000',
    cancelButtonColor: '#ef4444',
    customClass: {
      popup: 'swal2-custom-border'
    }
  };
}

function showToast(icon, title) {
  const isDark = document.body.classList.contains('dark');
  const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true,
    background: isDark ? '#151c2c' : '#ffffff',
    color: isDark ? '#f8fafc' : '#0f172a',
    didOpen: (toast) => {
      toast.addEventListener('mouseenter', Swal.stopTimer);
      toast.addEventListener('mouseleave', Swal.resumeTimer);
    }
  });
  Toast.fire({ icon, title });
}

// --- Backup & Restore (Export / Import) Functions ---
function exportToCSV() {
  if (state.transactions.length === 0) {
    Swal.fire({
      icon: 'info',
      title: 'No Data',
      text: 'There are no transactions to export.',
      ...getSwalConfig()
    });
    return;
  }

  const headers = ['Date', 'Type', 'Description', 'Category', 'Amount'];
  const csvRows = [headers.join(',')];

  state.transactions.forEach(tx => {
    const row = [
      tx.date,
      tx.type,
      `"${tx.description.replace(/"/g, '""')}"`, // Escape inner quotes
      tx.category,
      tx.amount
    ];
    csvRows.push(row.join(','));
  });

  const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `fintrack_export_${state.user.username}_${getTodayString()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('success', 'CSV downloaded successfully!');
}

function exportToJSON() {
  if (state.transactions.length === 0) {
    Swal.fire({
      icon: 'info',
      title: 'No Data',
      text: 'There are no transactions to export.',
      ...getSwalConfig()
    });
    return;
  }

  const backupData = {
    version: '1.0',
    username: state.user.username,
    exportDate: new Date().toISOString(),
    transactions: state.transactions
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
  const link = document.createElement("a");
  link.setAttribute("href", dataStr);
  link.setAttribute("download", `fintrack_backup_${state.user.username}_${getTodayString()}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('success', 'JSON backup downloaded!');
}

function handleJSONImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const importedData = JSON.parse(event.target.result);
      
      // Validate backup format
      if (!importedData || !Array.isArray(importedData.transactions)) {
        throw new Error("Invalid backup format.");
      }

      Swal.fire({
        title: 'Import Backup?',
        text: `This will merge ${importedData.transactions.length} transactions into your active account.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, import',
        cancelButtonText: 'Cancel',
        ...getSwalConfig()
      }).then((result) => {
        if (result.isConfirmed) {
          const existingIds = new Set(state.transactions.map(tx => tx.id));
          let importedCount = 0;

          importedData.transactions.forEach(tx => {
            if (tx.type && tx.amount && tx.date && tx.category && tx.description) {
              if (!existingIds.has(tx.id)) {
                state.transactions.push({
                  id: tx.id || (Date.now() + Math.random()),
                  type: tx.type,
                  amount: Number(tx.amount),
                  date: tx.date,
                  description: tx.description,
                  category: tx.category
                });
                importedCount++;
              }
            }
          });

          // Save to Local Storage
          localStorage.setItem(`fintrack_transactions_${state.user.username}`, JSON.stringify(state.transactions));
          refreshUI();
          
          Swal.fire({
            icon: 'success',
            title: 'Import Successful',
            text: `Successfully imported ${importedCount} new transactions.`,
            ...getSwalConfig()
          });
        }
      });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Import Failed',
        text: 'The uploaded file is not a valid JSON backup.',
        ...getSwalConfig()
      });
    }
    
    // Reset file input
    e.target.value = '';
  };
  reader.readAsText(file);
}

// --- Initial Mock Data for First-Time Users ---
function getMockTransactions() {
  const today = new Date();
  const d1 = new Date(today);
  d1.setDate(today.getDate() - 3);
  const d2 = new Date(today);
  d2.setDate(today.getDate() - 2);
  const d3 = new Date(today);
  d3.setDate(today.getDate() - 1);
  const d4 = new Date(today);

  const pad = (n) => n < 10 ? '0' + n : n;
  const formatDate = (dateObj) => `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;

  return [
    {
      id: Date.now() - 300000,
      type: 'income',
      description: 'Monthly Salary Credits',
      amount: 3200.00,
      date: formatDate(d1),
      category: 'Salary'
    },
    {
      id: Date.now() - 200000,
      type: 'expense',
      description: 'Whole Foods Grocery Run',
      amount: 142.50,
      date: formatDate(d2),
      category: 'Food & Dining'
    },
    {
      id: Date.now() - 100000,
      type: 'expense',
      description: 'Electricity & Gas Bill',
      amount: 88.20,
      date: formatDate(d3),
      category: 'Utilities'
    },
    {
      id: Date.now() - 50000,
      type: 'expense',
      description: 'Weekend Movie Ticket',
      amount: 24.00,
      date: formatDate(d4),
      category: 'Entertainment'
    },
    {
      id: Date.now() - 10000,
      type: 'income',
      description: 'Freelance Design Project',
      amount: 450.00,
      date: formatDate(d4),
      category: 'Other'
    }
  ];
}

// --- Dynamic Category Loader ---
function populateCategories(type) {
  const categorySelect = document.getElementById('tx-category');
  if (!categorySelect) return;
  categorySelect.innerHTML = '';
  
  // Add placeholder
  const placeholderOpt = document.createElement('option');
  placeholderOpt.value = '';
  placeholderOpt.disabled = true;
  placeholderOpt.selected = true;
  placeholderOpt.textContent = 'Select a category';
  categorySelect.appendChild(placeholderOpt);
  
  const options = defaultCategories[type] || [];
  options.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    const icon = categoryIcons[cat] || '🏷️';
    opt.textContent = `${icon} ${cat}`;
    categorySelect.appendChild(opt);
  });
}

// --- Theme Management ---
function initTheme() {
  const savedTheme = localStorage.getItem('fintrack_theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  const isDark = savedTheme === 'dark' || (!savedTheme && systemPrefersDark);
  
  if (isDark) {
    document.body.classList.add('dark');
  } else {
    document.body.classList.remove('dark');
  }
  
  const toggle = document.getElementById('settings-theme-toggle');
  if (toggle) {
    toggle.checked = isDark;
  }
}

function toggleTheme(e) {
  const isDark = e.target.checked;
  if (isDark) {
    document.body.classList.add('dark');
    localStorage.setItem('fintrack_theme', 'dark');
  } else {
    document.body.classList.remove('dark');
    localStorage.setItem('fintrack_theme', 'light');
  }
  
  // Refresh chart so axis labels adapt
  renderChart();
}

// --- Navigation Controller & Mobile Sidebar Auto-Close ---
function closeSidebarOnMobile() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar && sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
  }
  if (overlay && overlay.classList.contains('open')) {
    overlay.classList.remove('open');
  }
}

function showPage(pageId) {
  state.activePage = pageId;
  closeSidebarOnMobile();
  
  const dashboardView = document.getElementById('view-dashboard');
  const settingsView = document.getElementById('view-settings');
  const navDashboard = document.getElementById('nav-dashboard');
  const navSettings = document.getElementById('nav-settings');
  
  if (pageId === 'dashboard') {
    dashboardView.classList.remove('hidden');
    settingsView.classList.add('hidden');
    navDashboard.classList.add('active');
    navSettings.classList.remove('active');
    // Redraw chart to fit the container size
    setTimeout(renderChart, 50);
  } else if (pageId === 'settings') {
    dashboardView.classList.add('hidden');
    settingsView.classList.remove('hidden');
    navDashboard.classList.remove('active');
    navSettings.classList.add('active');
    
    // Fill settings form
    document.getElementById('settings-name').value = state.user.name;
    document.getElementById('settings-currency').value = state.user.currency;
  }
}

// --- Core UI Rendering ---
function refreshUI() {
  // Update Navbar profile and badge names
  document.getElementById('user-display-name').textContent = state.user.name;
  
  // Calculate Totals
  let totalIncome = 0;
  let totalExpense = 0;
  
  state.transactions.forEach(tx => {
    const amount = Number(tx.amount);
    if (tx.type === 'income') {
      totalIncome += amount;
    } else {
      totalExpense += amount;
    }
  });
  
  const balance = totalIncome - totalExpense;
  const count = state.transactions.length;
  
  // Write to cards
  document.getElementById('stat-balance').textContent = formatCurrency(balance, state.user.currency);
  document.getElementById('stat-income').textContent = formatCurrency(totalIncome, state.user.currency);
  document.getElementById('stat-expense').textContent = formatCurrency(totalExpense, state.user.currency);
  document.getElementById('stat-count').textContent = count;
  
  // Balance value color highlights
  const balanceEl = document.getElementById('stat-balance');
  if (balance < 0) {
    balanceEl.style.color = 'var(--danger-color)';
  } else if (balance > 0) {
    balanceEl.style.color = 'var(--success-color)';
  } else {
    balanceEl.style.color = 'var(--text-main)';
  }
  
  // Render table rows & chart options
  renderTable();
  renderChart();
}

function renderTable() {
  const tbody = document.getElementById('transaction-tbody');
  const emptyState = document.getElementById('table-empty-state');
  tbody.innerHTML = '';
  
  // Filter transactions
  let filtered = state.transactions;
  
  if (state.activeFilter === 'income') {
    filtered = filtered.filter(tx => tx.type === 'income');
  } else if (state.activeFilter === 'expense') {
    filtered = filtered.filter(tx => tx.type === 'expense');
  }
  
  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase();
    filtered = filtered.filter(tx => 
      tx.description.toLowerCase().includes(query) || 
      tx.category.toLowerCase().includes(query)
    );
  }
  
  // Toggle displays
  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    document.querySelector('.transaction-table').classList.add('hidden');
  } else {
    emptyState.classList.add('hidden');
    document.querySelector('.transaction-table').classList.remove('hidden');
    
    // Sort transactions descending chronologically
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    filtered.forEach(tx => {
      const tr = document.createElement('tr');
      
      const dateObj = new Date(tx.date);
      const formattedDate = dateObj.toLocaleDateString(undefined, { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        timeZone: 'UTC'
      });
      
      const categoryIcon = categoryIcons[tx.category] || '🏷️';
      const categoryClass = tx.category.toLowerCase().replace('& ', '').replace(' ', '-');
      
      const amountPrefix = tx.type === 'income' ? '+' : '-';
      const amountClass = tx.type === 'income' ? 'amt-income' : 'amt-expense';
      const amountFormatted = formatCurrency(tx.amount, state.user.currency);
      
      tr.innerHTML = `
        <td>${formattedDate}</td>
        <td style="font-weight: 500;">${tx.description}</td>
        <td>
          <span class="cat-badge badge-${categoryClass}">
            ${categoryIcon} ${tx.category}
          </span>
        </td>
        <td class="text-right ${amountClass}">${amountPrefix}${amountFormatted}</td>
        <td class="text-center">
          <button class="btn-delete-row" data-id="${tx.id}" title="Delete transaction">
            <i data-lucide="trash-2"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    
    // Fire Lucide to render newly inserted table row actions
    lucide.createIcons();
    
    // Bind deletes
    document.querySelectorAll('.btn-delete-row').forEach(btn => {
      btn.addEventListener('click', function() {
        const id = parseInt(this.getAttribute('data-id'));
        deleteTransaction(id);
      });
    });
  }
}

function renderChart() {
  const canvas = document.getElementById('cashflow-chart');
  if (!canvas) return;
  
  // Aggregate daily totals
  const dailyTotals = {};
  
  state.transactions.forEach(tx => {
    const dateStr = tx.date;
    if (!dailyTotals[dateStr]) {
      dailyTotals[dateStr] = { income: 0, expense: 0 };
    }
    if (tx.type === 'income') {
      dailyTotals[dateStr].income += Number(tx.amount);
    } else {
      dailyTotals[dateStr].expense += Number(tx.amount);
    }
  });
  
  // Sort dates chronologically
  const sortedDates = Object.keys(dailyTotals).sort((a, b) => new Date(a) - new Date(b));
  
  // Limit to last 7 transaction days
  const chartDates = sortedDates.slice(-7);
  
  const incomes = chartDates.map(d => dailyTotals[d].income);
  const expenses = chartDates.map(d => dailyTotals[d].expense);
  
  const displayLabels = chartDates.map(d => {
    const dateObj = new Date(d);
    return dateObj.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric',
      timeZone: 'UTC'
    });
  });
  
  // Colors and themes
  const isDark = document.body.classList.contains('dark');
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)';
  
  // Destroy old charts to clean up canvas overlaps
  if (cashFlowChart) {
    cashFlowChart.destroy();
  }
  
  const ctx = canvas.getContext('2d');
  
  if (chartDates.length === 0) {
    cashFlowChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['No Data Available'],
        datasets: [{
          label: 'Cash Flow',
          data: [0],
          backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { ticks: { color: textColor } },
          y: { grid: { color: gridColor }, ticks: { color: textColor } }
        }
      }
    });
    return;
  }
  
  cashFlowChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: displayLabels,
      datasets: [
        {
          label: 'Income',
          data: incomes,
          backgroundColor: 'rgba(16, 185, 129, 0.85)',
          hoverBackgroundColor: '#10b981',
          borderRadius: 6,
          maxBarThickness: 32
        },
        {
          label: 'Expense',
          data: expenses,
          backgroundColor: 'rgba(239, 68, 68, 0.85)',
          hoverBackgroundColor: '#ef4444',
          borderRadius: 6,
          maxBarThickness: 32
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: textColor,
            font: { family: 'Inter', size: 12, weight: '500' },
            boxWidth: 12,
            boxHeight: 12,
            useBorderRadius: true,
            borderRadius: 3
          }
        },
        tooltip: {
          backgroundColor: isDark ? '#0f172a' : '#ffffff',
          titleColor: isDark ? '#f8fafc' : '#1e293b',
          bodyColor: isDark ? '#94a3b8' : '#64748b',
          borderColor: gridColor,
          borderWidth: 1,
          padding: 10,
          titleFont: { family: 'Inter', weight: '600' },
          bodyFont: { family: 'Inter' },
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) label += ': ';
              if (context.parsed.y !== null) {
                label += formatCurrency(context.parsed.y, state.user.currency);
              }
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: {
            color: textColor,
            font: { family: 'Inter', size: 11 }
          }
        },
        y: {
          stacked: true,
          grid: { color: gridColor, drawTicks: false },
          ticks: {
            color: textColor,
            font: { family: 'Inter', size: 11 },
            callback: function(value) {
              const symbol = currencies[state.user.currency]?.symbol || '$';
              return symbol + Number(value).toLocaleString();
            }
          },
          border: { dash: [5, 5] }
        }
      }
    }
  });
}

// --- CRUD Actions ---
function addTransaction(txData) {
  const transaction = {
    id: Date.now(),
    ...txData
  };
  
  state.transactions.push(transaction);
  localStorage.setItem(`fintrack_transactions_${state.user.username}`, JSON.stringify(state.transactions));
  
  refreshUI();
  showToast('success', 'Transaction added successfully!');
}

function deleteTransaction(id) {
  Swal.fire({
    title: 'Delete Transaction?',
    text: "Are you sure you want to delete this transaction?",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, delete it',
    cancelButtonText: 'Cancel',
    ...getSwalConfig()
  }).then((result) => {
    if (result.isConfirmed) {
      state.transactions = state.transactions.filter(tx => tx.id !== id);
      localStorage.setItem(`fintrack_transactions_${state.user.username}`, JSON.stringify(state.transactions));
      refreshUI();
      showToast('success', 'Transaction deleted!');
    }
  });
}

// --- App Control Flow ---
function handleLoginSubmit(e) {
  e.preventDefault();
  
  const usernameInput = document.getElementById('login-username').value.trim();
  const passwordInput = document.getElementById('login-password').value;
  
  if (!usernameInput || !passwordInput) return;
  
  const accounts = JSON.parse(localStorage.getItem('fintrack_accounts') || '{}');
  const account = accounts[usernameInput.toLowerCase()];
  
  if (account && account.password === passwordInput) {
    state.user = {
      username: account.username,
      name: account.name,
      currency: account.currency
    };
    
    localStorage.setItem('fintrack_user', JSON.stringify(state.user));
    
    // Set up empty transactions if first login
    const savedTx = localStorage.getItem(`fintrack_transactions_${account.username}`);
    if (!savedTx) {
      state.transactions = [];
      localStorage.setItem(`fintrack_transactions_${account.username}`, JSON.stringify(state.transactions));
    } else {
      state.transactions = JSON.parse(savedTx);
    }
    
    // Transition display
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('app-section').classList.remove('hidden');
    
    // Clear login form
    document.getElementById('login-form').reset();
    
    // Update currency display labels
    updateModalCurrencySymbol();
    
    // Refresh layout
    refreshUI();
    showPage('dashboard');
    showToast('success', `Welcome back, ${state.user.name}!`);
  } else {
    Swal.fire({
      icon: 'error',
      title: 'Login Failed',
      text: 'Invalid username or password!',
      ...getSwalConfig()
    });
  }
}

function handleRegisterSubmit(e) {
  e.preventDefault();
  
  const usernameInput = document.getElementById('register-username').value.trim();
  const passwordInput = document.getElementById('register-password').value;
  
  if (!usernameInput || !passwordInput) return;
  
  const accounts = JSON.parse(localStorage.getItem('fintrack_accounts') || '{}');
  const key = usernameInput.toLowerCase();
  
  if (accounts[key]) {
    Swal.fire({
      icon: 'error',
      title: 'Username Taken',
      text: 'Username already exists! Please choose another one.',
      ...getSwalConfig()
    });
    return;
  }
  
  // Register account with default Display Name (Username) and USD Currency
  accounts[key] = {
    username: key,
    password: passwordInput,
    name: usernameInput,
    currency: 'USD'
  };
  
  localStorage.setItem('fintrack_accounts', JSON.stringify(accounts));
  
  Swal.fire({
    icon: 'success',
    title: 'Account Created',
    text: 'Account created successfully! You can now log in.',
    ...getSwalConfig()
  }).then(() => {
    // Clear register form and switch to login
    document.getElementById('register-form').reset();
    showAuthCard('login');
  });
}

function showAuthCard(view) {
  const loginCard = document.getElementById('auth-login-card');
  const registerCard = document.getElementById('auth-register-card');
  
  if (view === 'login') {
    loginCard.classList.remove('hidden');
    registerCard.classList.add('hidden');
  } else {
    loginCard.classList.add('hidden');
    registerCard.classList.remove('hidden');
  }
}

function updateModalCurrencySymbol() {
  const symbol = currencies[state.user.currency]?.symbol || '$';
  const el = document.querySelector('.amount-currency-symbol');
  if (el) el.textContent = symbol;
}

function handleSettingsSubmit(e) {
  e.preventDefault();
  
  const nameInput = document.getElementById('settings-name').value.trim();
  const currencyInput = document.getElementById('settings-currency').value;
  
  if (!nameInput) return;
  
  state.user.name = nameInput;
  state.user.currency = currencyInput;
  
  // Update local storage session
  localStorage.setItem('fintrack_user', JSON.stringify(state.user));
  
  // Sync changes to accounts database
  const accounts = JSON.parse(localStorage.getItem('fintrack_accounts') || '{}');
  const key = state.user.username.toLowerCase();
  if (accounts[key]) {
    accounts[key].name = nameInput;
    accounts[key].currency = currencyInput;
    localStorage.setItem('fintrack_accounts', JSON.stringify(accounts));
  }
  
  // Update input currency label
  updateModalCurrencySymbol();
  
  refreshUI();
  
  // Show save indicator, then return to dashboard
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const origText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i data-lucide="check"></i> Saved!';
  submitBtn.style.backgroundColor = '#10b981';
  lucide.createIcons();
  
  setTimeout(() => {
    submitBtn.innerHTML = origText;
    submitBtn.style.backgroundColor = '';
    lucide.createIcons();
    showPage('dashboard');
  }, 1000);
}

function handleResetData() {
  Swal.fire({
    title: 'Reset Account Data?',
    text: "Are you absolutely sure you want to reset your account data? This will wipe your transaction history permanently.",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, reset it',
    cancelButtonText: 'Cancel',
    ...getSwalConfig()
  }).then((result) => {
    if (result.isConfirmed) {
      localStorage.removeItem(`fintrack_transactions_${state.user.username}`);
      state.transactions = [];
      refreshUI();
      showToast('success', 'Account data reset successful!');
    }
  });
}

function handleLogout() {
  Swal.fire({
    title: 'Logout?',
    text: "Are you sure you want to log out?",
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Yes, logout',
    cancelButtonText: 'Cancel',
    ...getSwalConfig()
  }).then((result) => {
    if (result.isConfirmed) {
      localStorage.removeItem('fintrack_user');
      state.user = null;
      document.getElementById('login-section').classList.remove('hidden');
      document.getElementById('app-section').classList.add('hidden');
      
      // Clear forms and show login view
      document.getElementById('login-form').reset();
      document.getElementById('register-form').reset();
      showAuthCard('login');
      showToast('success', 'Logged out successfully!');
    }
  });
}

// --- Modal Control Functions ---
function openModal() {
  closeSidebarOnMobile();
  const modal = document.getElementById('transaction-modal');
  modal.classList.remove('hidden');
  
  // Reset Form and set default dates
  document.getElementById('transaction-form').reset();
  document.getElementById('tx-date').value = getTodayString();
  
  // Default type selection to Expense
  const typeSelect = document.getElementById('tx-type');
  typeSelect.value = 'expense';
  populateCategories('expense');
}

function closeModal() {
  const modal = document.getElementById('transaction-modal');
  modal.classList.add('hidden');
}

function handleTransactionFormSubmit(e) {
  e.preventDefault();
  
  const type = document.getElementById('tx-type').value;
  const amount = parseFloat(document.getElementById('tx-amount').value);
  const date = document.getElementById('tx-date').value;
  const description = document.getElementById('tx-description').value.trim();
  const category = document.getElementById('tx-category').value;
  
  if (isNaN(amount) || amount <= 0) {
    alert('Please enter a valid amount greater than zero.');
    return;
  }
  
  if (!date || !description || !category) {
    alert('Please fill out all transaction fields.');
    return;
  }
  
  addTransaction({
    type,
    amount,
    date,
    description,
    category
  });
  
  closeModal();
}

// --- Initialize Event Listeners ---
function setupEventListeners() {
  // Authentication Forms
  document.getElementById('login-form').addEventListener('submit', handleLoginSubmit);
  document.getElementById('register-form').addEventListener('submit', handleRegisterSubmit);
  
  // Auth Switch links
  document.getElementById('go-to-register').addEventListener('click', (e) => {
    e.preventDefault();
    showAuthCard('register');
  });
  document.getElementById('go-to-login').addEventListener('click', (e) => {
    e.preventDefault();
    showAuthCard('login');
  });
  
  // Nav Links
  document.getElementById('nav-dashboard').addEventListener('click', (e) => {
    e.preventDefault();
    showPage('dashboard');
  });
  document.getElementById('nav-settings').addEventListener('click', (e) => {
    e.preventDefault();
    showPage('settings');
  });
  
  // Action triggers
  document.getElementById('add-transaction-btn').addEventListener('click', openModal);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  
  // Modal handlers
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  
  // Close modal clicking outside the modal card
  document.getElementById('transaction-modal').addEventListener('click', (e) => {
    if (e.target.id === 'transaction-modal') {
      closeModal();
    }
  });
  
  // Transaction type toggle category refresh
  document.getElementById('tx-type').addEventListener('change', (e) => {
    populateCategories(e.target.value);
  });
  
  // Modal submission
  document.getElementById('transaction-form').addEventListener('submit', handleTransactionFormSubmit);
  
  // Filters
  document.getElementById('filter-select').addEventListener('change', (e) => {
    state.activeFilter = e.target.value;
    renderTable();
  });
  
  // Search
  document.getElementById('search-input').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderTable();
  });
  
  // Settings Form
  document.getElementById('settings-form').addEventListener('submit', handleSettingsSubmit);
  document.getElementById('settings-theme-toggle').addEventListener('change', toggleTheme);
  document.getElementById('reset-data-btn').addEventListener('click', handleResetData);

  // Backup & Restore Events
  document.getElementById('table-export-csv').addEventListener('click', exportToCSV);
  document.getElementById('settings-export-csv').addEventListener('click', exportToCSV);
  document.getElementById('settings-export-json').addEventListener('click', exportToJSON);
  
  const importBtn = document.getElementById('settings-import-btn');
  const importInput = document.getElementById('import-file-input');
  if (importBtn && importInput) {
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', handleJSONImport);
  }

  // Mobile Sidebar Drawer Toggle Events
  const toggleSidebar = () => {
    document.querySelector('.sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('open');
  };
  
  const mobileToggle = document.getElementById('mobile-sidebar-toggle');
  if (mobileToggle) {
    mobileToggle.addEventListener('click', toggleSidebar);
  }
  
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) {
    overlay.addEventListener('click', toggleSidebar);
  }
}

// --- App Entry Point ---
window.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Theme (runs before user displays to prevent light flashes)
  initTheme();
  
  // 2. Pre-seed default demo account if no accounts exist
  const accounts = JSON.parse(localStorage.getItem('fintrack_accounts') || '{}');
  if (Object.keys(accounts).length === 0) {
    accounts['admin'] = {
      username: 'admin',
      password: 'admin',
      name: 'Administrator',
      currency: 'USD'
    };
    localStorage.setItem('fintrack_accounts', JSON.stringify(accounts));
  }
  
  // 3. Scan for existing user session
  const savedUser = localStorage.getItem('fintrack_user');
  
  if (savedUser) {
    state.user = JSON.parse(savedUser);
    
    // Load this specific user's transactions
    const savedTx = localStorage.getItem(`fintrack_transactions_${state.user.username}`);
    if (savedTx) {
      state.transactions = JSON.parse(savedTx);
    } else {
      // Setup empty data for active returning user with clean storage
      state.transactions = [];
      localStorage.setItem(`fintrack_transactions_${state.user.username}`, JSON.stringify(state.transactions));
    }
    
    // Switch views
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('app-section').classList.remove('hidden');
    
    // Load data and refresh
    updateModalCurrencySymbol();
    refreshUI();
    showPage('dashboard');
  } else {
    // Show login page
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('app-section').classList.add('hidden');
    showAuthCard('login');
  }
  
  // 4. Mount Event listeners
  setupEventListeners();
  
  // 5. Fire Lucide icons replacement on page elements
  lucide.createIcons();
});
