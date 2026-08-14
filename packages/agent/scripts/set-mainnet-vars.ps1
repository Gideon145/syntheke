# Sets environment variables for the Railway agent-mainnet service.
# Secrets are read from local files at runtime — nothing is echoed.
param()

$ErrorActionPreference = "Stop"
$here = "c:\Users\vergio\Dev\syntheke\packages\agent"

$agentKey = (Get-Content "$here\.env.mainnet" -Raw).Trim()
$envLines = Get-Content "$here\.env"
function Get-EnvValue([string]$name) {
  $line = $envLines | Where-Object { $_ -like "$name=*" } | Select-Object -First 1
  if (-not $line) { return "" }
  return ($line -replace "^$name=", "").Trim()
}

$vars = @(
  "XLAYER_RPC_URL=https://rpc.xlayer.tech",
  "XLAYER_CHAIN_ID=196",
  "LEGACY_SYNTHEKE_CONTRACTS=",
  "SERVICE_PRICE_USD=0.1",
  "AGENT_PRIVATE_KEY=$agentKey",
  "THEMIS_PRIVATE_KEY=$(Get-EnvValue 'THEMIS_PRIVATE_KEY')",
  "THEMIS_ADDRESS=$(Get-EnvValue 'THEMIS_ADDRESS')",
  "ATHENA_PRIVATE_KEY=$(Get-EnvValue 'ATHENA_PRIVATE_KEY')",
  "ATHENA_ADDRESS=$(Get-EnvValue 'ATHENA_ADDRESS')",
  "SOLON_PRIVATE_KEY=$(Get-EnvValue 'SOLON_PRIVATE_KEY')",
  "SOLON_ADDRESS=$(Get-EnvValue 'SOLON_ADDRESS')",
  "AI_API_KEY=$(Get-EnvValue 'AI_API_KEY')",
  "AI_MODEL=$(Get-EnvValue 'AI_MODEL')",
  "AI_BASE_URL=$(Get-EnvValue 'AI_BASE_URL')",
  "DEEPSEEK_API_KEY=$(Get-EnvValue 'DEEPSEEK_API_KEY')",
  "DEEPSEEK_MODEL=$(Get-EnvValue 'DEEPSEEK_MODEL')",
  "DEEPSEEK_BASE_URL=$(Get-EnvValue 'DEEPSEEK_BASE_URL')",
  "OKX_AGENT_IDS=Themis:10920,Athena:10921,Solon:10922",
  "MONITOR_INTERVAL_SEC=60",
  "MONITOR_ENABLED=false",
  "MEDIATOR_STAKE_AMOUNT=0.0005"
)

$args = @()
foreach ($v in $vars) { $args += $v }
& railway variable set -s agent-mainnet @args
Write-Output "variables set (count: $($vars.Count))"
