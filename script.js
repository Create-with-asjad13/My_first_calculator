/* =========================================================
   Calcula — a calculator built with vanilla JavaScript.
   No eval(): calculations run through a small state machine.
   ========================================================= */

(() => {
  "use strict";

  // ---------- DOM ----------
  const resultEl = document.getElementById("result");
  const expressionEl = document.getElementById("expression");
  const historyListEl = document.getElementById("historyList");
  const historyEmptyEl = document.getElementById("historyEmpty");
  const historyPanel = document.getElementById("history");
  const keysEl = document.querySelector(".keys");

  // ---------- Constants ----------
  const MAX_DIGITS = 15;
  const HISTORY_LIMIT = 50;
  const STORAGE_HISTORY = "calcula.history";
  const STORAGE_THEME = "calcula.theme";
  const SYMBOLS = { "+": "+", "-": "−", "*": "×", "/": "÷", "^": "^" };

  // ---------- State ----------
  const state = {
    current: "0",       // number currently being typed / shown
    previous: null,     // left-hand operand
    operator: null,     // "+", "-", "*", "/", "^"
    overwrite: true,    // next digit replaces the display
    error: false,
  };
  let history = [];

  // ---------- Math helpers ----------
  const compute = (a, op, b) => {
    switch (op) {
      case "+": return a + b;
      case "-": return a - b;
      case "*": return a * b;
      case "/":
        if (b === 0) throw new Error("Cannot divide by zero");
        return a / b;
      case "^": return Math.pow(a, b);
      default: return b;
    }
  };

  // Fixes floating point noise: 0.1 + 0.2 -> 0.3
  const clean = (n) => parseFloat(n.toPrecision(12));

  const format = (value) => {
    const str = String(value);
    if (str.includes("e")) return str;
    const [int, dec] = str.split(".");
    const sign = int.startsWith("-") ? "-" : "";
    const digits = sign ? int.slice(1) : int;
    const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return sign + grouped + (dec !== undefined ? "." + dec : "");
  };

  // ---------- Display ----------
  const render = () => {
    resultEl.textContent = state.error ? state.current : format(state.current);
    resultEl.classList.toggle("error", state.error);

    const len = resultEl.textContent.length;
    resultEl.classList.toggle("small", len > 10 && len <= 14);
    resultEl.classList.toggle("smaller", len > 14);

    expressionEl.textContent =
      state.previous !== null && state.operator
        ? `${format(state.previous)} ${SYMBOLS[state.operator]}`
        : "";

    // highlight the active operator
    document.querySelectorAll(".key.op").forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.dataset.op === state.operator && state.overwrite && state.previous !== null
      );
    });
  };

  const showError = (message) => {
    state.error = true;
    state.current = message;
    state.previous = null;
    state.operator = null;
    state.overwrite = true;
    render();
  };

  const resetIfError = () => {
    if (state.error) clearAll();
  };

  // ---------- Actions ----------
  const clearAll = () => {
    Object.assign(state, {
      current: "0", previous: null, operator: null, overwrite: true, error: false,
    });
    render();
  };

  const inputDigit = (d) => {
    resetIfError();
    if (state.overwrite) {
      state.current = d;
      state.overwrite = false;
    } else if (state.current.replace(/[-.]/g, "").length < MAX_DIGITS) {
      state.current = state.current === "0" ? d : state.current + d;
    }
    render();
  };

  const inputDecimal = () => {
    resetIfError();
    if (state.overwrite) {
      state.current = "0.";
      state.overwrite = false;
    } else if (!state.current.includes(".")) {
      state.current += ".";
    }
    render();
  };

  const backspace = () => {
    if (state.error) return clearAll();
    if (state.overwrite) return;
    state.current = state.current.length > 1 && state.current !== "-0"
      ? state.current.slice(0, -1)
      : "0";
    if (state.current === "-") state.current = "0";
    render();
  };

  const negate = () => {
    if (state.error || state.current === "0") return;
    state.current = state.current.startsWith("-")
      ? state.current.slice(1)
      : "-" + state.current;
    render();
  };

  const chooseOperator = (op) => {
    if (state.error) return;
    // Chain: 2 + 3 + ... -> evaluate 2 + 3 first
    if (state.operator && !state.overwrite) {
      const a = Number(state.previous);
      const b = Number(state.current);
      try {
        const res = clean(compute(a, state.operator, b));
        addHistory(`${format(a)} ${SYMBOLS[state.operator]} ${format(b)}`, res);
        state.previous = res;
        state.current = String(res);
      } catch (e) {
        return showError(e.message);
      }
    } else if (state.previous === null || !state.operator) {
      state.previous = Number(state.current);
    }
    state.operator = op;
    state.overwrite = true;
    render();
  };

  const equals = () => {
    if (state.error || !state.operator || state.previous === null) return;
    const a = Number(state.previous);
    const b = Number(state.current);
    try {
      const res = clean(compute(a, state.operator, b));
      if (!Number.isFinite(res)) throw new Error("Result too large");
      addHistory(`${format(a)} ${SYMBOLS[state.operator]} ${format(b)}`, res);
      state.current = String(res);
      state.previous = null;
      state.operator = null;
      state.overwrite = true;
      render();
    } catch (e) {
      showError(e.message);
    }
  };

  const percent = () => {
    if (state.error) return;
    const cur = Number(state.current);
    let res;
    if (state.previous !== null && (state.operator === "+" || state.operator === "-")) {
      // 200 + 10%  ->  200 + 20
      res = clean((Number(state.previous) * cur) / 100);
    } else {
      res = clean(cur / 100);
    }
    addHistory(`${format(cur)}%`, res);
    state.current = String(res);
    state.overwrite = false;
    render();
  };

  const square = () => {
    if (state.error) return;
    const cur = Number(state.current);
    const res = clean(cur * cur);
    if (!Number.isFinite(res)) return showError("Result too large");
    addHistory(`sqr(${format(cur)})`, res);
    state.current = String(res);
    state.overwrite = true;
    render();
  };

  // ---------- History ----------
  const loadHistory = () => {
    try {
      history = JSON.parse(localStorage.getItem(STORAGE_HISTORY)) || [];
    } catch {
      history = [];
    }
  };

  const saveHistory = () => {
    try { localStorage.setItem(STORAGE_HISTORY, JSON.stringify(history)); } catch { /* ignore */ }
  };

  const addHistory = (expression, result) => {
    history.unshift({ expression, result: String(result) });
    history = history.slice(0, HISTORY_LIMIT);
    saveHistory();
    renderHistory();
  };

  const renderHistory = () => {
    historyListEl.innerHTML = "";
    historyEmptyEl.style.display = history.length ? "none" : "block";
    history.forEach((item) => {
      const li = document.createElement("li");
      li.title = "Click to reuse this result";
      li.innerHTML = `<div class="h-expr"></div><div class="h-res"></div>`;
      li.querySelector(".h-expr").textContent = item.expression + " =";
      li.querySelector(".h-res").textContent = format(item.result);
      li.addEventListener("click", () => {
        state.error = false;
        state.current = item.result;
        state.overwrite = true;
        render();
      });
      historyListEl.appendChild(li);
    });
  };

  // ---------- Events ----------
  keysEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const { action, digit, op } = btn.dataset;
    switch (action) {
      case "digit": inputDigit(digit); break;
      case "decimal": inputDecimal(); break;
      case "operator": chooseOperator(op); break;
      case "equals": equals(); break;
      case "clear": clearAll(); break;
      case "backspace": backspace(); break;
      case "negate": negate(); break;
      case "percent": percent(); break;
      case "square": square(); break;
    }
  });

  // Keyboard support
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    let selector = null;

    if (/^[0-9]$/.test(k)) { inputDigit(k); selector = `[data-digit="${k}"]`; }
    else if (k === "." || k === ",") { inputDecimal(); selector = '[data-action="decimal"]'; }
    else if (["+", "-", "*", "/", "^"].includes(k)) {
      e.preventDefault();
      chooseOperator(k);
      selector = `[data-op="${CSS.escape(k)}"]`;
    }
    else if (k === "x" || k === "X") { chooseOperator("*"); selector = '[data-op="*"]'; }
    else if (k === "Enter" || k === "=") { e.preventDefault(); equals(); selector = '[data-action="equals"]'; }
    else if (k === "Backspace") { backspace(); selector = '[data-action="backspace"]'; }
    else if (k === "Escape" || k === "Delete") { clearAll(); selector = '[data-action="clear"]'; }
    else if (k === "%") { percent(); selector = '[data-action="percent"]'; }

    if (selector) flash(selector);
  });

  // Brief press animation for keyboard input
  const flash = (selector) => {
    const btn = document.querySelector(`.key${selector}`);
    if (!btn) return;
    btn.classList.add("pressed");
    setTimeout(() => btn.classList.remove("pressed"), 110);
  };

  // History panel + clear
  document.getElementById("historyToggle").addEventListener("click", () => {
    historyPanel.classList.toggle("hidden");
  });
  document.getElementById("clearHistory").addEventListener("click", () => {
    history = [];
    saveHistory();
    renderHistory();
  });

  // Theme toggle (remembered between visits)
  const root = document.documentElement;
  const applyTheme = (theme) => root.setAttribute("data-theme", theme);
  let savedTheme = null;
  try { savedTheme = localStorage.getItem(STORAGE_THEME); } catch { /* ignore */ }
  applyTheme(
    savedTheme || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
  );
  document.getElementById("themeToggle").addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem(STORAGE_THEME, next); } catch { /* ignore */ }
  });

  // ---------- Init ----------
  loadHistory();
  renderHistory();
  render();
})();