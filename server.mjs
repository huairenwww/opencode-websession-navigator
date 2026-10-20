import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createOpencodeClient } from "@opencode-ai/sdk"

const host = process.env.HOST ?? "0.0.0.0"
const port = Number(process.env.PORT ?? 8093)
const opencodeUrl = process.env.OPENCODE_URL ?? "http://127.0.0.1:9966"
const directory = process.env.OPENCODE_DIRECTORY ?? process.cwd()
const publicDir = join(fileURLToPath(new URL(".", import.meta.url)), "public")
const client = createOpencodeClient({ baseUrl: opencodeUrl })

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
}

const data = (result) => result?.data ?? result

async function api(pathname, response) {
  if (pathname === "/api/config") {
    return json(response, { opencodePort: new URL(opencodeUrl).port || "80", directory })
  }

  if (pathname === "/api/sessions") {
    const result = await client.session.list({ query: { directory } })
    const sessions = data(result)
      .filter((session) => !session.parentID && session.directory === directory)
      .sort((a, b) => b.time.updated - a.time.updated)
    return json(response, sessions)
  }

  const match = pathname.match(/^\/api\/sessions\/(ses_[A-Za-z0-9]+)\/messages$/)
  if (match) {
    const result = await client.session.messages({ path: { id: match[1] }, query: { directory } })
    const messages = data(result)
      .filter((item) => item.info.role === "user")
      .map((item) => ({
        id: item.info.id,
        created: item.info.time.created,
        text: item.parts
          .filter((part) => part.type === "text" && !part.synthetic)
          .map((part) => part.text.trim())
          .filter(Boolean)
          .join("\n") || "(attachment or empty prompt)",
      }))
      .sort((a, b) => a.created - b.created)
    return json(response, messages)
  }

  return false
}

function json(response, body, status = 200) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" })
  response.end(JSON.stringify(body))
  return true
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`)
    if (url.pathname.startsWith("/api/")) {
      if (await api(url.pathname, response)) return
      return json(response, { error: "Not found" }, 404)
    }

    const pathname = url.pathname === "/" ? "/index.html" : url.pathname
    if (!/^\/[A-Za-z0-9._/-]+$/.test(pathname) || pathname.includes("..")) {
      response.writeHead(400).end("Bad request")
      return
    }
    const file = await readFile(join(publicDir, pathname))
    response.writeHead(200, { "content-type": types[extname(pathname)] ?? "application/octet-stream" })
    response.end(file)
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404).end("Not found")
      return
    }
    console.error(error)
    json(response, { error: error.message }, 500)
  }
}).listen(port, host, () => {
  console.log(`OpenCode Session Navigator: http://${host}:${port}`)
  console.log(`OpenCode API: ${opencodeUrl}`)
})
