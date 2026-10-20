// ==UserScript==
// @name         OpenCode Message Timeline
// @namespace    local.opencodetools
// @version      1.0.1
// @description  List every user prompt in an OpenCode Web session and jump to it.
// @match        http://127.0.0.1:9966/*
// @match        http://localhost:9966/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict"

  const HOST_ID = "opencode-message-timeline"
  const state = {
    sessionID: "",
    messages: [],
    activeID: "",
    collapsed: localStorage.getItem(`${HOST_ID}:collapsed`) === "1",
    domMessageCount: 0,
    refreshTimer: 0,
    domCheckTimer: 0,
  }

  const host = document.createElement("div")
  host.id = HOST_ID
  const root = host.attachShadow({ mode: "open" })
  document.documentElement.append(host)

  root.innerHTML = `
    <style>
      :host { color-scheme: light dark; }
      * { box-sizing: border-box; }
      #toggle {
        position: fixed; right: 14px; top: 50%; z-index: 2147483646;
        width: 42px; height: 42px; border: 1px solid #73737355; border-radius: 13px;
        background: color-mix(in srgb, Canvas 92%, transparent); color: CanvasText;
        box-shadow: 0 8px 28px #0003; cursor: pointer; backdrop-filter: blur(12px);
        font: 700 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      #panel {
        position: fixed; right: 14px; top: 72px; bottom: 72px; z-index: 2147483645;
        width: min(320px, calc(100vw - 28px)); display: flex; flex-direction: column;
        border: 1px solid #73737355; border-radius: 16px; overflow: hidden;
        background: color-mix(in srgb, Canvas 94%, transparent); color: CanvasText;
        box-shadow: 0 16px 50px #0004; backdrop-filter: blur(18px);
        font: 13px/1.45 ui-sans-serif, system-ui, sans-serif;
      }
      #panel[hidden], #toggle[hidden] { display: none; }
      header { display: flex; align-items: center; gap: 8px; padding: 11px 12px; border-bottom: 1px solid #73737338; }
      header strong { flex: 1; font-size: 13px; }
      header span { color: color-mix(in srgb, CanvasText 58%, transparent); font-variant-numeric: tabular-nums; }
      .icon {
        width: 28px; height: 28px; border: 0; border-radius: 8px; cursor: pointer;
        background: color-mix(in srgb, CanvasText 8%, transparent); color: CanvasText;
        font: 16px/1 sans-serif;
      }
      .icon:hover, .icon:focus-visible { background: color-mix(in srgb, CanvasText 15%, transparent); outline: none; }
      #list { overflow: auto; padding: 7px; scrollbar-width: thin; }
      .message {
        width: 100%; display: grid; grid-template-columns: 28px 1fr; gap: 7px;
        padding: 9px 8px; border: 0; border-radius: 10px; text-align: left; cursor: pointer;
        background: transparent; color: CanvasText; font: inherit;
      }
      .message:hover, .message:focus-visible { background: color-mix(in srgb, CanvasText 8%, transparent); outline: none; }
      .message.active { background: color-mix(in srgb, #5b8cff 20%, transparent); }
      .index { color: color-mix(in srgb, CanvasText 45%, transparent); font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
      .text { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
      #empty { padding: 18px 14px; color: color-mix(in srgb, CanvasText 55%, transparent); text-align: center; }
      @media (max-width: 680px) {
        #panel { top: 58px; right: 8px; bottom: 58px; width: min(290px, calc(100vw - 16px)); }
        #toggle { right: 8px; }
      }
      @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
    </style>
    <button id="toggle" title="Open message timeline">TL</button>
    <aside id="panel" aria-label="User message timeline">
      <header>
        <strong>Message timeline</strong>
        <span id="count">0</span>
        <button class="icon" id="refresh" title="Refresh">↻</button>
        <button class="icon" id="collapse" title="Collapse">×</button>
      </header>
      <nav id="list"></nav>
    </aside>
  `

  const panel = root.querySelector("#panel")
  const toggle = root.querySelector("#toggle")
  const list = root.querySelector("#list")
  const count = root.querySelector("#count")

  function getSessionID() {
    return location.href.match(/\b(ses_[A-Za-z0-9]+)\b/)?.[1] ?? ""
  }

  function promptText(parts) {
    const text = parts
      .filter((part) => part.type === "text" && !part.synthetic)
      .map((part) => part.text?.trim())
      .filter(Boolean)
      .join("\n")
    return text || "(attachment or empty prompt)"
  }

  async function loadMessages() {
    const sessionID = getSessionID()
    state.sessionID = sessionID
    host.hidden = false
    if (!sessionID) {
      state.messages = []
      state.activeID = ""
      render()
      return
    }

    try {
      const response = await fetch(`/session/${encodeURIComponent(sessionID)}/message`, {
        credentials: "same-origin",
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      if (sessionID !== state.sessionID) return
      state.messages = data
        .filter((item) => item.info?.role === "user")
        .map((item) => ({
          id: item.info.id,
          created: item.info.time?.created ?? 0,
          text: promptText(item.parts ?? []),
        }))
        .sort((a, b) => a.created - b.created)
      render()
      updateActive()
    } catch (error) {
      list.innerHTML = `<div id="empty">Timeline unavailable: ${escapeHTML(error.message)}</div>`
      count.textContent = "!"
    }
  }

  function escapeHTML(value) {
    const node = document.createElement("span")
    node.textContent = value
    return node.innerHTML
  }

  function render() {
    count.textContent = String(state.messages.length)
    if (!state.messages.length) {
      list.innerHTML = `<div id="empty">${state.sessionID ? "No user messages in this session." : "Open a session to see its messages."}</div>`
      return
    }
    list.replaceChildren(
      ...state.messages.map((message, index) => {
        const button = document.createElement("button")
        button.className = `message${message.id === state.activeID ? " active" : ""}`
        button.dataset.messageId = message.id
        button.title = message.text
        button.innerHTML = `<span class="index">${String(index + 1).padStart(2, "0")}</span><span class="text"></span>`
        button.querySelector(".text").textContent = message.text
        button.addEventListener("click", () => jumpTo(message.id))
        return button
      }),
    )
  }

  function jumpTo(messageID) {
    const anchor = `message-${messageID}`
    const target = document.getElementById(anchor) ?? document.querySelector(`[data-message-id="${CSS.escape(messageID)}"]`)
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" })
      history.replaceState(history.state, "", `${location.pathname}${location.search}#${anchor}`)
    } else {
      location.hash = anchor
      window.dispatchEvent(new HashChangeEvent("hashchange"))
    }
    setActive(messageID)
  }

  function setActive(messageID) {
    if (state.activeID === messageID) return
    state.activeID = messageID
    root.querySelectorAll(".message").forEach((button) => {
      button.classList.toggle("active", button.dataset.messageId === messageID)
    })
    root.querySelector(`.message[data-message-id="${CSS.escape(messageID)}"]`)?.scrollIntoView({ block: "nearest" })
  }

  function updateActive() {
    const rows = [...document.querySelectorAll("[data-message-id]")]
    if (!rows.length) return
    const readingLine = Math.min(innerHeight * 0.32, 240)
    let active = rows[0]
    for (const row of rows) {
      if (row.getBoundingClientRect().top <= readingLine) active = row
      else break
    }
    setActive(active.dataset.messageId)
  }

  function setCollapsed(value) {
    state.collapsed = value
    panel.hidden = value
    toggle.hidden = !value
    localStorage.setItem(`${HOST_ID}:collapsed`, value ? "1" : "0")
  }

  function scheduleRefresh(delay = 200) {
    clearTimeout(state.refreshTimer)
    state.refreshTimer = setTimeout(loadMessages, delay)
  }

  root.querySelector("#refresh").addEventListener("click", loadMessages)
  root.querySelector("#collapse").addEventListener("click", () => setCollapsed(true))
  toggle.addEventListener("click", () => setCollapsed(false))
  setCollapsed(state.collapsed)

  let scrolling = false
  addEventListener("scroll", () => {
    if (scrolling) return
    scrolling = true
    requestAnimationFrame(() => {
      updateActive()
      scrolling = false
    })
  }, true)

  const observer = new MutationObserver(() => {
    clearTimeout(state.domCheckTimer)
    state.domCheckTimer = setTimeout(() => {
      const sessionID = getSessionID()
      const domMessageCount = document.querySelectorAll("[data-message-id]").length
      if (sessionID !== state.sessionID || domMessageCount !== state.domMessageCount) {
        state.domMessageCount = domMessageCount
        scheduleRefresh(350)
      }
    }, 150)
  })
  observer.observe(document.body, { childList: true, subtree: true })

  for (const method of ["pushState", "replaceState"]) {
    const original = history[method]
    history[method] = function (...args) {
      const result = original.apply(this, args)
      queueMicrotask(() => scheduleRefresh())
      return result
    }
  }
  addEventListener("popstate", () => scheduleRefresh())
  loadMessages()
})()
