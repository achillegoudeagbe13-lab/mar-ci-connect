import * as vscode from 'vscode'

let panel: vscode.WebviewPanel | undefined
let latestTranscript = ''

const applicationUrl = process.env.MARCI_CONNECT_URL || 'http://localhost:5173'

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand('marciConnect.open', () => openPanel(context)))
  context.subscriptions.push(vscode.commands.registerCommand('marciConnect.insertTranscript', async () => {
    if (!latestTranscript) {
      vscode.window.showInformationMessage('Aucune transcription disponible. Ouvrez MAR-CI Connect et activez la transcription.')
      return
    }
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      vscode.window.showWarningMessage('Ouvrez un fichier avant d’insérer le compte-rendu.')
      return
    }
    await editor.edit((edit) => edit.insert(editor.selection.active, `\n${latestTranscript}\n`))
    vscode.window.showInformationMessage('Compte-rendu MAR-CI inséré dans l’éditeur actif.')
  }))
}

function openPanel(context: vscode.ExtensionContext) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside)
    return
  }
  panel = vscode.window.createWebviewPanel('marciConnect', 'MAR-CI Connect', vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
  })
  panel.webview.html = getWebviewHtml(panel.webview, applicationUrl)
  panel.webview.onDidReceiveMessage((message: { type?: string; markdown?: string }) => {
    if (message.type === 'marci-transcription' && typeof message.markdown === 'string') latestTranscript = message.markdown
  }, undefined, context.subscriptions)
  panel.onDidDispose(() => { panel = undefined }, undefined, context.subscriptions)
}

function getWebviewHtml(webview: vscode.Webview, url: string) {
  const nonce = getNonce()
  const escapedUrl = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http: https:; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MAR-CI Connect</title>
<style>html,body,iframe{width:100%;height:100%;margin:0;border:0;overflow:hidden;background:#111311} .offline{display:none;color:#d8f060;padding:16px;font:13px sans-serif}</style>
</head>
<body>
<iframe src="${escapedUrl}" allow="camera; microphone; display-capture; autoplay" title="MAR-CI Connect"></iframe>
<div class="offline">Démarrez l’application avec <code>npm run dev</code>, puis rechargez ce panneau.</div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'marci-transcription') vscode.postMessage(event.data);
});
</script>
</body>
</html>`
}

function getNonce() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let value = ''
  for (let index = 0; index < 32; index += 1) value += alphabet.charAt(Math.floor(Math.random() * alphabet.length))
  return value
}

export function deactivate() {
  panel?.dispose()
}
