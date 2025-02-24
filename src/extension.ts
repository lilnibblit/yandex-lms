import * as vscode from 'vscode';
import * as fs from "fs";
import * as path from "path";
import fetch from 'node-fetch';
import FormData from 'form-data';
// import { default as axios } from 'axios'

export function activate(context: vscode.ExtensionContext) {
  const provider = new MyWebviewViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("lms.Browse", provider, { webviewOptions: { retainContextWhenHidden: true } })
  );
}

let view: vscode.WebviewView;
export class MyWebviewViewProvider implements vscode.WebviewViewProvider {
  constructor(private context: vscode.ExtensionContext) {}

  resolveWebviewView(
    panel: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    panel.webview.options = {
      enableScripts: true
    };

    if (path.join(__dirname, "session.txt"))
      panel.webview.html = this.getWebviewContent(this.context, "lessons");
    else panel.webview.html = this.getWebviewContent(this.context, "login");

    panel.webview.onDidReceiveMessage(
      async (message) => {
        let cookie;
        switch (message.command) {
          case 'href':
            panel.webview.html = this.getWebviewContent(this.context, message.href);
            return;

          case 'fetch':
            cookie = this.Session() || "sigma";

            const response = await fetch(message.url, {
              headers: {
                "Cookie": cookie
              }
            });

            if (response.status != 200) {
              vscode.window.showErrorMessage(response.status.toString());
              return;
            }

            const body = await response.json();
            panel.webview.postMessage({ command: "fetch", body: body });
            
            return;

          case 'session':
            this.Session(message.data);
            return;

          case 'setCode':
            if (!vscode.workspace.workspaceFolders) {
              return vscode.window.showErrorMessage('No folder or workspace opened!');
            }

            const writeStr = message.code;
            const writeData = Buffer.from(writeStr, 'utf8');

            const folderUri = vscode.workspace.workspaceFolders[0].uri;
            const fileUri = folderUri.with({ path: path.posix.join(folderUri.path, message.name) });

            await vscode.workspace.fs.writeFile(fileUri, writeData);

            vscode.window.showTextDocument(fileUri);
            return;

          case 'submit':
            const active = vscode.window.activeTextEditor?.document.uri.fsPath;
            if (!active) {
              return vscode.window.showErrorMessage('No active text editor!');
            }
            cookie = this.Session() || "sigma";

            const formData = new FormData();
            formData.append('file', fs.createReadStream(active), {
              filename: 'solution.py',
              contentType: 'text/x-python'
            });
            
            const csrf = (';'+cookie).split(`;csrftoken=`).pop()?.split(';')[0] || "ligma"

            const solve = await fetch(`https://lms.yandex.ru/api/student/solutions/${message.solutionId}/comments/files`, {
              method: 'POST',
              headers: {
                "Cookie": cookie,
                "x-csrf-token": csrf,
                ...formData.getHeaders()
              },
              body: formData
            });
        }
      }
    );
  }

  getWebviewContent(context: vscode.ExtensionContext, page:string) {
    return fs.readFileSync(path.join(context.extensionPath, "src", "web", `${page}.html`), 'utf-8').toString();
  }
  Session(data = undefined) {
    if (data) {
      fs.writeFileSync(path.join(__dirname, "session.txt"), data);
    } else {
      return fs.readFileSync(path.join(__dirname, "session.txt"), 'utf-8').toString();
    }
  }
}

