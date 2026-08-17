# Sets environment variables for the Railway agent-mainnet service.
# Secrets are read from local files at runtime — nothing is echoed.
param()

$ErrorActionPreference = "Stop"
$here = "c:\Users\vergio\Dev\syntheke\packages\agent"

$agentKey = (Get-Content "$here\.env.mainnet" | Select-Object -First 1).Trim()
$partyBKey = (Get-Content "$here\.env.mainnet" | Select-Object -Last 1).Trim()
$envLines = Get-Content "$here\.env"
function Get-EnvValue([string]$name) {
  $line = $envLines | Where-Object { $_ -like "$name=*" } | Select-Object -First 1
  if (-not $line) { return "" }
  return ($line -replace "^$name=", "").Trim()
}

$vars = @(
  "XLAYER_RPC_URL=https://rpc.xlayer.tech",
  "XLAYER_CHAIN_ID=196",
  "MAINNET_SYNTHEKE_CONTRACT=0x668776ffc7a1da6f39413987f038a7a1e0e1fb9d",
  "LEGACY_SYNTHEKE_CONTRACTS=0x2693Bab68Fa76b9DF585416672c1363FA5b0fE7A,0x91ddd53ea56519e6f33231e76112a3643fd24f0b",
  "SERVICE_PRICE_USD=0.1",
  "X402_SETTLED_BASELINE=19",
  "AGENT_PRIVATE_KEY=$agentKey",
  "DEMO_PARTY_B_KEY=$partyBKey",
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
  "OKX_API_KEY=$(Get-EnvValue 'OKX_API_KEY')",
  "OKX_SECRET_KEY=$(Get-EnvValue 'OKX_SECRET_KEY')",
  "OKX_PASSPHRASE=$(Get-EnvValue 'OKX_PASSPHRASE')",
  "OKX_AGENT_IDS=Themis:10920,Athena:10921,Solon:10922",
  "MAINNET_ARTIFACT_REGISTRY=0x00cdEF3FF818Eb4CE9a9fd529E6aF6f4efEa24e9",
  "MONITOR_INTERVAL_SEC=15",
  "MONITOR_ENABLED=true",
  "MEDIATOR_STAKE_AMOUNT=0.0005"
)

$args = @()
foreach ($v in $vars) { $args += $v }
& railway variable set -s agent-mainnet @args
Write-Output "variables set (count: $($vars.Count))"
