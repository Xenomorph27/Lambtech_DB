<#
.SYNOPSIS
  Makes a new intake secret for the website's enquiry form.

.DESCRIPTION
  Prints two things:
    1. the secret   -> paste into Vercel (project lambtech-website) as
                       ENQUIRY_INTAKE_SECRET. Shown once; not saved anywhere.
    2. one SQL line -> run in Supabase > SQL Editor. It stores only the
                       SHA-256 of the secret, which is safe to keep.

  To rotate: run this again, add the new SQL line, update Vercel and
  redeploy, then delete the old row from enquiry_intake_keys.
#>
$ErrorActionPreference = 'Stop'

$bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')

$sha = [System.Security.Cryptography.SHA256]::Create()
$hash = -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($secret)) | ForEach-Object { $_.ToString('x2') })
$label = 'website ' + (Get-Date -Format 'yyyy-MM-dd')

''
'1) Vercel > lambtech-website > Settings > Environment Variables'
'   ENQUIRY_INTAKE_SECRET ='
"   $secret"
''
'2) Supabase > SQL Editor > run:'
"   insert into enquiry_intake_keys (sha256, label) values ('$hash', '$label');"
''
