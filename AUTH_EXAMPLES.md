# Authentication Examples

Exemplos práticos de uso da autenticação OAuth2 em diferentes cenários.

## 1. Fluxo Completo de Login via Browser

### HTML Simples para Teste

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Azure DevOps MCP - Login</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        max-width: 600px;
        margin: 50px auto;
        padding: 20px;
      }
      .container {
        border: 1px solid #ccc;
        padding: 20px;
        border-radius: 8px;
      }
      button {
        background-color: #0078d4;
        color: white;
        padding: 10px 20px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
      }
      button:hover {
        background-color: #005a9e;
      }
      .info {
        margin-top: 20px;
        padding: 10px;
        background-color: #f0f0f0;
        border-radius: 4px;
      }
      .error {
        color: red;
        margin-top: 10px;
      }
      .success {
        color: green;
        margin-top: 10px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Azure DevOps MCP</h1>

      <div id="login-section">
        <h2>Login</h2>
        <button onclick="handleLogin()">Sign in with Azure AD</button>
      </div>

      <div id="user-section" style="display: none;">
        <h2>Bem-vindo!</h2>
        <div id="user-info"></div>
        <button onclick="handleLogout()">Logout</button>
      </div>

      <div id="status"></div>
    </div>

    <script>
      const API_URL = "http://localhost:8080";

      // Verificar se já está autenticado
      window.onload = function () {
        const token = localStorage.getItem("auth_token");
        if (token) {
          getUserInfo(token);
          showUserSection();
        }
      };

      function handleLogin() {
        // Redirecionar para endpoint de login
        window.location.href = `${API_URL}/auth/login`;
      }

      function handleLogout() {
        const token = localStorage.getItem("auth_token");

        fetch(`${API_URL}/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
          .then((response) => response.json())
          .then((data) => {
            localStorage.removeItem("auth_token");
            showStatus("Logged out successfully", "success");
            hideUserSection();
            setTimeout(() => location.reload(), 2000);
          })
          .catch((error) => {
            console.error("Logout error:", error);
            showStatus("Logout failed", "error");
          });
      }

      function getUserInfo(token) {
        fetch(`${API_URL}/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
          .then((response) => response.json())
          .then((data) => {
            if (data.user) {
              document.getElementById("user-info").innerHTML = `
                        <p><strong>Name:</strong> ${data.user.displayName}</p>
                        <p><strong>Email:</strong> ${data.user.email}</p>
                        <p><strong>ID:</strong> ${data.user.userId}</p>
                    `;
              showStatus("Authenticated", "success");
            }
          })
          .catch((error) => {
            console.error("Error fetching user info:", error);
            localStorage.removeItem("auth_token");
            hideUserSection();
          });
      }

      function showUserSection() {
        document.getElementById("login-section").style.display = "none";
        document.getElementById("user-section").style.display = "block";
      }

      function hideUserSection() {
        document.getElementById("login-section").style.display = "block";
        document.getElementById("user-section").style.display = "none";
      }

      function showStatus(message, type) {
        const status = document.getElementById("status");
        status.className = type;
        status.textContent = message;
      }
    </script>
  </body>
</html>
```

## 2. Cliente Node.js / JavaScript

### Exemplo com Fetch API

```javascript
class AzureDevOpsClient {
  constructor(apiUrl = "http://localhost:8080") {
    this.apiUrl = apiUrl;
    this.token = localStorage.getItem("auth_token");
  }

  // Fazer login
  async login() {
    window.location.href = `${this.apiUrl}/auth/login`;
  }

  // Fazer logout
  async logout() {
    try {
      const response = await fetch(`${this.apiUrl}/auth/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (response.ok) {
        localStorage.removeItem("auth_token");
        return true;
      }
    } catch (error) {
      console.error("Logout failed:", error);
    }
    return false;
  }

  // Obter informações do usuário
  async getUser() {
    try {
      const response = await fetch(`${this.apiUrl}/auth/me`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      return await response.json();
    } catch (error) {
      console.error("Failed to get user:", error);
      return null;
    }
  }

  // Fazer requisição autenticada
  async request(endpoint, options = {}) {
    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        "Authorization": `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 401) {
      // Token expirado, fazer login novamente
      this.login();
      throw new Error("Unauthorized");
    }

    return response.json();
  }
}

// Uso
const client = new AzureDevOpsClient();

// Login
client.login();

// Obter usuário
client.getUser().then((data) => console.log(data));

// Fazer requisição
client.request("/api/projects").then((data) => console.log(data));
```

### Exemplo com Axios

```javascript
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:8080",
});

// Adicionar token a todos os requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Manejar 401 Unauthorized
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("auth_token");
      window.location.href = "/";
    }
    return Promise.reject(error);
  }
);

// Login
async function login() {
  window.location.href = "http://localhost:8080/auth/login";
}

// Logout
async function logout() {
  await api.post("/auth/logout");
  localStorage.removeItem("auth_token");
}

// Obter usuário
async function getUser() {
  const { data } = await api.get("/auth/me");
  return data.user;
}

// Uso
const user = await getUser();
console.log(user);
```

## 3. Cliente Python

```python
import requests
import json
from typing import Optional

class AzureDevOpsClient:
    def __init__(self, api_url: str = "http://localhost:8080"):
        self.api_url = api_url
        self.token: Optional[str] = None
        self.session = requests.Session()

    def get_headers(self) -> dict:
        """Retorna headers com autenticação"""
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def login_url(self) -> str:
        """Retorna URL de login"""
        return f"{self.api_url}/auth/login"

    def set_token(self, token: str):
        """Define o token de autenticação"""
        self.token = token

    def get_user(self) -> dict:
        """Obtém informações do usuário autenticado"""
        response = self.session.get(
            f"{self.api_url}/auth/me",
            headers=self.get_headers()
        )
        response.raise_for_status()
        return response.json()

    def logout(self) -> bool:
        """Faz logout"""
        response = self.session.post(
            f"{self.api_url}/auth/logout",
            headers=self.get_headers()
        )
        if response.status_code == 200:
            self.token = None
            return True
        return False

    def request(self, method: str, endpoint: str, **kwargs) -> dict:
        """Faz requisição autenticada"""
        headers = self.get_headers()
        headers.update(kwargs.pop('headers', {}))

        response = self.session.request(
            method,
            f"{self.api_url}{endpoint}",
            headers=headers,
            **kwargs
        )

        if response.status_code == 401:
            raise Exception("Unauthorized. Please login again.")

        response.raise_for_status()
        return response.json()

# Uso
client = AzureDevOpsClient()
client.set_token("seu-token-aqui")

# Obter usuário
user = client.get_user()
print(f"User: {user['user']}")

# Fazer logout
client.logout()
```

## 4. Cliente cURL

```bash
# 1. Fazer login (abre browser)
open "http://localhost:8080/auth/login"

# 2. Copiar o token da resposta

# 3. Usar o token em requests
TOKEN="<seu-token>"

# Obter informações do usuário
curl http://localhost:8080/auth/me \
  -H "Authorization: Bearer $TOKEN"

# Verificar status
curl http://localhost:8080/auth/status

# Fazer logout
curl -X POST http://localhost:8080/auth/logout \
  -H "Authorization: Bearer $TOKEN"

# Renovar token
curl -X POST http://localhost:8080/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<refresh-token>"}'
```

## 5. Tratamento de Erros

### Erros Comuns

```javascript
async function handleAuthCallError(error) {
  if (error.response?.status === 401) {
    // Token inválido ou expirado
    console.log("Token expirado. Faça login novamente.");
    localStorage.removeItem("auth_token");
    redirectToLogin();
  } else if (error.response?.status === 400) {
    // Requisição inválida
    console.log(`Erro: ${error.response.data.message}`);
  } else if (error.response?.status === 500) {
    // Erro do servidor
    console.log("Erro no servidor. Tente novamente.");
  } else {
    // Erro de rede
    console.log("Erro de conexão.");
  }
}

// Uso
try {
  const user = await getUser();
} catch (error) {
  handleAuthCallError(error);
}
```

## 6. Refresh Token Flow

```javascript
async function getValidToken() {
  let token = localStorage.getItem("auth_token");
  const refreshToken = localStorage.getItem("refresh_token");

  // Verificar se token está valido (você pode decodificar o JWT)
  if (isTokenExpired(token) && refreshToken) {
    try {
      // Renovar token
      const response = await fetch("http://localhost:8080/auth/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken }),
      });

      const data = await response.json();
      token = data.token;
      localStorage.setItem("auth_token", token);
    } catch (error) {
      // Falhou renovação, fazer login novamente
      redirectToLogin();
    }
  }

  return token;
}
```

## 7. React Hook para Autenticação

```javascript
import { useState, useEffect } from "react";

function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");

    if (token) {
      fetch("http://localhost:8080/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((res) => res.json())
        .then((data) => {
          setUser(data.user);
          setLoading(false);
        })
        .catch((err) => {
          setError(err);
          localStorage.removeItem("auth_token");
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const login = () => {
    window.location.href = "http://localhost:8080/auth/login";
  };

  const logout = async () => {
    const token = localStorage.getItem("auth_token");
    await fetch("http://localhost:8080/auth/logout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    localStorage.removeItem("auth_token");
    setUser(null);
  };

  return { user, loading, error, login, logout };
}

// Uso
function App() {
  const { user, loading, login, logout } = useAuth();

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {user ? (
        <div>
          <h1>Welcome {user.displayName}</h1>
          <button onClick={logout}>Logout</button>
        </div>
      ) : (
        <button onClick={login}>Login</button>
      )}
    </div>
  );
}
```

---

**Status**: ✅ Exemplos Completos  
**Última Atualização**: 2026-03-03
