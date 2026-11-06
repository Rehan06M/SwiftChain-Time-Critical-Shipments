$envPath = Join-Path $PSScriptRoot ".env"

if (!(Test-Path $envPath)) {
  throw "backend/.env was not found."
}

$secureKey = Read-Host "Paste the key copied from console.groq.com/keys" -AsSecureString

$credential = [System.Management.Automation.PSCredential]::new(
  "groq",
  $secureKey
)

try {
  $key = $credential.GetNetworkCredential().Password.Trim()

  if ([string]::IsNullOrWhiteSpace($key)) {
    throw "Empty key."
  }

  $body = @{
    model = "openai/gpt-oss-20b"
    messages = @(
      @{
        role = "user"
        content = "Reply with OK."
      }
    )
    max_completion_tokens = 100
    reasoning_effort = "low"
  } | ConvertTo-Json -Depth 5

  # Save the key only after Groq accepts a chat request.
  $null = Invoke-RestMethod `
    -Uri "https://api.groq.com/openai/v1/chat/completions" `
    -Method Post `
    -Headers @{ Authorization = "Bearer $key" } `
    -ContentType "application/json" `
    -Body $body

  $content = [System.IO.File]::ReadAllText($envPath)

  $content = [regex]::Replace(
    $content,
    '(?m)^[ \t]*(?:export[ \t]+)?GROQ_API_KEY[ \t]*=.*(?:\r?\n|$)',
    ''
  )

  [System.IO.File]::WriteAllText(
    $envPath,
    $content.TrimEnd() + "`r`nGROQ_API_KEY=$key`r`n",
    [System.Text.UTF8Encoding]::new($false)
  )

  Write-Output "SUCCESS: Chat request accepted and key saved to backend/.env."
}
catch {
  if ($null -ne $_.Exception.Response) {
    $status = [int]$_.Exception.Response.StatusCode
    Write-Output "FAILED: HTTP $status. Key was not saved."
  }
  else {
    Write-Output "FAILED: Could not complete validation or save the key."
  }
}
finally {
  Remove-Variable key, credential, secureKey -ErrorAction SilentlyContinue
}