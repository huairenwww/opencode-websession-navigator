const sessions = document.querySelector("#sessions")
const messages = document.querySelector("#messages")
const search = document.querySelector("#search")
const frame = document.querySelector("#opencode")
const open = document.querySelector("#open")
const current = document.querySelector("#current")
const count = document.querySelector("#count")
const status = document.querySelector("#status")

let config
let sessionList = []
let activeMessageID = ""
const messageDate = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
})

async function request(path) {
  const response = await fetch(path)
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

function opencodeOrigin() {
  return `${location.protocol}//${location.hostname}:${config.opencodePort}`
}

function serverKey() {
  const bytes = new TextEncoder().encode(opencodeOrigin())
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function sessionURL(sessionID, messageID = "") {
  const hash = messageID ? `#message-${messageID}` : ""
  return `${opencodeOrigin()}/server/${serverKey()}/session/${encodeURIComponent(sessionID)}${hash}`
}

async function loadSessions(preferredID) {
  status.textContent = "正在读取 sessions..."
  sessionList = await request("/api/sessions")
  sessions.replaceChildren(...sessionList.map((session) => {
    const option = document.createElement("option")
    option.value = session.id
    option.textContent = session.title
    return option
  }))

  const selected = sessionList.some((item) => item.id === preferredID)
    ? preferredID
    : sessionList[0]?.id
  if (!selected) {
    status.textContent = "没有找到 session"
    return
  }
  sessions.value = selected
  await selectSession(selected)
}

async function selectSession(sessionID) {
  search.value = ""
  const session = sessionList.find((item) => item.id === sessionID)
  current.textContent = session?.title ?? sessionID
  const url = sessionURL(sessionID)
  frame.src = url
  open.href = url
  history.replaceState(null, "", `?session=${sessionID}`)
  status.textContent = "正在读取用户消息..."

  const list = await request(`/api/sessions/${sessionID}/messages`)
  messages.replaceChildren(...list.map((message, index) => {
    const button = document.createElement("button")
    button.className = "message"
    button.dataset.messageId = message.id
    button.title = message.text
    button.innerHTML = `<span class="number">${String(index + 1).padStart(2, "0")}</span><span class="body"><span class="text"></span><time class="date"></time></span>`
    button.querySelector(".text").textContent = message.text
    const date = button.querySelector(".date")
    date.dateTime = new Date(message.created).toISOString()
    date.textContent = messageDate.format(message.created)
    button.addEventListener("click", () => jump(sessionID, message.id))
    return button
  }))
  filterMessages()
  status.textContent = `${list.length} 条用户消息`
}

function filterMessages() {
  const query = search.value.trim().toLocaleLowerCase()
  const buttons = messages.querySelectorAll(".message")
  let matches = 0
  for (const button of buttons) {
    button.hidden = !button.querySelector(".text").textContent.toLocaleLowerCase().includes(query)
    if (!button.hidden) matches++
  }
  count.textContent = query ? `${matches} / ${buttons.length}` : String(buttons.length)
  status.textContent = query ? (matches ? `找到 ${matches} 条消息` : "没有匹配的用户消息") : `${buttons.length} 条用户消息`
}

function jump(sessionID, messageID) {
  activeMessageID = messageID
  messages.querySelectorAll(".message").forEach((button) => {
    button.classList.toggle("active", button.dataset.messageId === messageID)
  })
  const url = sessionURL(sessionID, messageID)
  frame.src = url
  open.href = url
}

sessions.addEventListener("change", () => selectSession(sessions.value).catch(showError))
search.addEventListener("input", filterMessages)
document.querySelector("#refresh").addEventListener("click", () => loadSessions(sessions.value).catch(showError))

function showError(error) {
  console.error(error)
  status.textContent = `错误：${error.message}`
}

try {
  config = await request("/api/config")
  await loadSessions(new URLSearchParams(location.search).get("session"))
} catch (error) {
  showError(error)
}
