---
title: "How to View and Export Saved Wi-Fi Passwords on Windows with netsh"
excerpt: "Learn the Windows netsh commands to list saved Wi-Fi profiles, view a saved network's security details, format results with PowerShell, and export your own Wi-Fi details with one click."
author: "Ajay Singh"
tags:
  - Windows
  - Networking
  - PowerShell
  - Automation
created_at: "2026-10-20"
updated_at: "2026-10-20"
published: true
slug: "windows-netsh-wifi-passwords"
---

# How to View and Export Saved Wi-Fi Passwords on Windows with `netsh`

Windows remembers Wi-Fi networks you have connected to, so you can reconnect without entering the password each time. If you need to connect a new device, recover a password you own, or document your own network configuration, the built-in `netsh` utility can help you inspect saved wireless profiles.

This guide starts with basic Command Prompt commands, then improves the output with PowerShell, and finishes with a script and a double-click launcher that export the details to a local file.

> **Privacy and permission:** Use these commands only on a Windows computer and Wi-Fi profiles you own or are authorized to administer. The `key=clear` option and exported files can reveal passwords in plain text. Store the output securely and delete it when you no longer need it. Do not share exported credentials publicly.

![Windows Terminal showing netsh wlan commands](./hero-image.jpg)

_Image by [Stefan Schweihofer](https://pixabay.com/users/stux-12364/) via [Pixabay](https://pixabay.com/)._

## Before you begin

The examples work on Windows 10 and Windows 11 with the built-in wireless networking tools. Open **Command Prompt** or **Windows PowerShell**. If Windows denies access to a profile or its key, retry in an elevated terminal (right-click the terminal app and choose **Run as administrator**) and make sure your Windows account is permitted to view that profile.

The examples use English Windows command output. On systems configured for another display language, `netsh` labels may be localized, so scripts that parse the displayed text may need corresponding changes.

## 1. List saved Wi-Fi profiles

Open Command Prompt and run:

```bat
netsh wlan show profiles
```

This lists wireless profiles saved on the computer. It does **not** display their passwords.

Example output (illustrative):

```text
Profiles on interface Wi-Fi:

Group policy profiles (read only)
---------------------------------
    <None>

User profiles
-------------
    All User Profile     : HomeWiFi
    All User Profile     : OfficeNetwork
    All User Profile     : GuestNetwork
```

The profile names in your output will be different. Use the name exactly as Windows displays it in the next command.

<!-- IMAGE PLACEHOLDER: Screenshot-style terminal illustration showing `netsh wlan show profiles` and fictional profile names only.
Suggested asset path: posts/windows/assets/netsh-show-profiles.webp -->

## 2. View one profile's details

To inspect a saved profile, replace `HomeWiFi` with the exact name of your own network:

```bat
netsh wlan show profile name="HomeWiFi"
```

This displays information about the selected profile, including its authentication and encryption settings. The password is normally hidden.

To show the saved key in clear text, run:

```bat
netsh wlan show profile name="HomeWiFi" key=clear
```

Look for the **Key Content** field under the security settings. If Windows has a retrievable saved key for that profile and your account has sufficient permissions, the value appears there.

Example only — never use a real password in screenshots or published examples:

```text
Security settings
-----------------
    Authentication         : WPA2-Personal
    Cipher                 : CCMP
    Security key           : Present
    Key Content            : example-only-password
```

If `Key Content` is missing, the profile may not have a retrievable shared key, the network may use enterprise authentication, or Windows may not allow the current account to reveal it. A profile for an enterprise network does not necessarily contain a single shared Wi-Fi password.

**Important:** `key=clear` reveals a credential. Avoid running it on a shared screen or recording, and do not paste the output into public support forums.

## 3. Show only the useful fields

If you only need the network name and key, PowerShell can filter the command output. This is a quick way to avoid scrolling through the full profile details:

```powershell
netsh wlan show profile name="HomeWiFi" key=clear |
    Select-String -Pattern '^\s*SSID name\s*:', '^\s*Key Content\s*:'
```

The exact labels can vary by Windows language and profile type. This is a display filter, not a comprehensive data export.

To see the full output in a text file instead, use output redirection:

```powershell
netsh wlan show profile name="HomeWiFi" key=clear |
    Out-File -FilePath "$env:USERPROFILE\Desktop\HomeWiFi-profile.txt" -Encoding utf8
```

This writes the command output to a text file on your Desktop. Because the output may contain the password, protect the file accordingly.

## 4. Format multiple profiles with PowerShell

Running the command manually for every network becomes tedious if you have many saved profiles. The following PowerShell script gathers the profile names, queries each profile, and prints a readable table containing the profile name and any available key.

The parser below targets the **English-language** `netsh` output. If your Windows display language is different, the profile-name and key labels may need adapting.

```powershell
# List saved Wi-Fi profiles and display their available keys.
# Use only on a computer and profiles you are authorized to access.

$profileOutput = netsh wlan show profiles
if ($LASTEXITCODE -ne 0) {
    throw "Could not list Wi-Fi profiles. Check the WLAN service and permissions."
}

$profiles = foreach ($line in $profileOutput) {
    if ($line -match '^\s*(?:All User Profile|User Profile)\s*:\s*(.+?)\s*$') {
        $Matches[1]
    }
}

$results = foreach ($profile in ($profiles | Sort-Object -Unique)) {
    $details = netsh wlan show profile name="$profile" key=clear 2>&1
    $keyLine = $details | Select-String -Pattern '^\s*Key Content\s*:\s*(.*)$' |
        Select-Object -First 1

    $password = $null
    if ($keyLine -and $keyLine.Line -match '^\s*Key Content\s*:\s*(.*)$') {
        $password = $Matches[1].Trim()
    }

    [pscustomobject]@{
        Profile  = $profile
        Password = if ([string]::IsNullOrWhiteSpace($password)) {
            '(not available)'
        } else {
            $password
        }
    }
}

$results | Format-Table -AutoSize -Wrap
```

The script reports `(not available)` when no key is found; that does not necessarily mean the network has no password. It may use enterprise authentication, the key may not be stored in a retrievable form, or the current account may lack permission.

<!-- IMAGE PLACEHOLDER: Terminal illustration showing a neatly formatted two-column table with fictional network names and clearly fake sample values.
Suggested asset path: posts/windows/assets/netsh-formatted-output.webp -->

### Why use PowerShell objects?

`Format-Table` is useful for terminal display, but it should not be used as the data source for exports. PowerShell objects preserve the fields as structured data, allowing the same `$results` collection to be written to CSV or JSON without scraping the visual table.

## 5. Export the results to CSV

CSV is useful if you want to review the list in a spreadsheet. Add this line after the script has created `$results`:

```powershell
$results | Export-Csv -Path "$env:USERPROFILE\Desktop\wifi-profiles.csv" -NoTypeInformation -Encoding utf8
```

To save a plain-text copy instead:

```powershell
$results |
    Format-Table -AutoSize -Wrap |
    Out-String |
    Set-Content -Path "$env:USERPROFILE\Desktop\wifi-profiles.txt" -Encoding utf8
```

CSV is better for structured columns; text is convenient for quick reading. Both files may contain plain-text Wi-Fi passwords. A CSV file is **not encrypted** just because it is opened in a spreadsheet application.

## 6. Create a one-click export script

The easiest reusable approach is to save the PowerShell script in a `.ps1` file and create a small `.bat` launcher beside it. Double-clicking the batch file starts the PowerShell script and saves a timestamped CSV in the same folder.

### Step 1: Save the PowerShell script

Create a file named `Export-WiFiProfiles.ps1` and paste in the complete script below:

```powershell
# Export-WiFiProfiles.ps1
# Exports saved Wi-Fi profile names and available keys to a local CSV.
# Use only for profiles you own or are authorized to administer.

$ErrorActionPreference = 'Stop'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outputPath = Join-Path $PSScriptRoot "WiFiProfiles-$timestamp.csv"

try {
    $profileOutput = netsh wlan show profiles
    if ($LASTEXITCODE -ne 0) {
        throw 'netsh could not list Wi-Fi profiles.'
    }

    $profiles = @(
        foreach ($line in $profileOutput) {
            if ($line -match '^\s*(?:All User Profile|User Profile)\s*:\s*(.+?)\s*$') {
                $Matches[1]
            }
        }
    ) | Sort-Object -Unique

    if ($profiles.Count -eq 0) {
        throw 'No profiles were parsed. Check that Wi-Fi profiles exist and that netsh output is in English.'
    }

    $results = foreach ($profile in $profiles) {
        $details = netsh wlan show profile name="$profile" key=clear 2>&1
        $password = ''

        foreach ($line in $details) {
            if ($line -match '^\s*Key Content\s*:\s*(.*)$') {
                $password = $Matches[1].Trim()
                break
            }
        }

        [pscustomobject]@{
            Profile  = $profile
            Password = $password
            KeyFound = -not [string]::IsNullOrWhiteSpace($password)
        }
    }

    $results | Export-Csv -LiteralPath $outputPath -NoTypeInformation -Encoding utf8
    Write-Host "Export complete: $outputPath" -ForegroundColor Green
    Write-Host 'The CSV may contain plain-text passwords. Keep it private.' -ForegroundColor Yellow
}
catch {
    Write-Error $_
    exit 1
}
```

The script deliberately leaves the password field blank when no key is available and records `KeyFound` as `False`. It does not imply that every network profile has a recoverable password. As above, profile parsing depends on English `netsh` output and may need localization for other Windows display languages.

### Step 2: Create the double-click launcher

In the same folder, create `Export-WiFiProfiles.bat` with this content:

```bat
@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Export-WiFiProfiles.ps1"
set "exitCode=%errorlevel%"

echo.
if not "%exitCode%"=="0" (
    echo Export failed. Review the error message above.
) else (
    echo Check this folder for the timestamped Wi-Fi CSV file.
)
echo.
pause
exit /b %exitCode%
```

Now double-click `Export-WiFiProfiles.bat`. The console stays open so you can read the result, and the CSV is saved beside the scripts.

`-ExecutionPolicy Bypass` applies only to this PowerShell process; it does not permanently change the machine's PowerShell execution policy. Follow your organization's policies on managed devices. If access is denied, open the launcher from an elevated terminal or run it with the required permissions. Do not run scripts from untrusted sources as administrator.

Your folder will look like this:

```text
WiFi-Export/
├── Export-WiFiProfiles.ps1
├── Export-WiFiProfiles.bat
└── WiFiProfiles-20261020-143000.csv  # example name; generated at runtime
```

<!-- IMAGE PLACEHOLDER: Small illustration of the two script files beside a generated CSV file in File Explorer; fictional filenames only.
Suggested asset path: posts/windows/assets/wifi-export-files.webp -->

### Optional: export only profile names

If you want a list of saved network names without querying passwords, use this smaller script. This is a safer choice when you only need to inventory known profiles.

```powershell
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outputPath = Join-Path $PSScriptRoot "WiFiProfileNames-$timestamp.csv"

netsh wlan show profiles |
    ForEach-Object {
        if ($_ -match '^\s*(?:All User Profile|User Profile)\s*:\s*(.+?)\s*$') {
            [pscustomobject]@{ Profile = $Matches[1] }
        }
    } |
    Sort-Object Profile -Unique |
    Export-Csv -LiteralPath $outputPath -NoTypeInformation -Encoding utf8

Write-Host "Profile names exported to: $outputPath"
```

## 7. Troubleshooting

### `There is no wireless interface on the system`

The computer may not have a wireless adapter, the adapter may be disabled, or its driver may not be available. Check **Settings → Network & internet** and Device Manager. A desktop connected only by Ethernet may not expose a WLAN interface.

### No `Key Content` appears

Not all profiles have a readable shared key. Enterprise Wi-Fi commonly authenticates users or devices individually rather than using one shared password. Also confirm that you're inspecting the correct profile and have the required permissions.

### The script exports no profiles

The parsing expressions expect English labels such as `All User Profile` and `Key Content`. On non-English Windows installations, the command output may use translated labels. Run `netsh wlan show profiles` manually and adapt the matching expressions to the labels on your computer.

### A profile name contains spaces

Keep the profile name inside quotes, for example:

```bat
netsh wlan show profile name="My Home WiFi" key=clear
```

### PowerShell says access is denied

Try a terminal with the appropriate privileges, and confirm that the profile is accessible to your account. On a managed computer, policy may restrict access; do not attempt to bypass organizational controls.

## Security notes

- Treat the exported CSV and text files as password lists.
- Store them only in a folder protected by your account, and avoid synced or shared folders unless that is intentional and approved.
- Do not attach the export to tickets, commit it to Git, or upload it to a public repository.
- Delete the export when it is no longer needed. Emptying the Recycle Bin does not guarantee forensic erasure on SSDs or synced storage.
- Consider Windows device encryption or BitLocker to protect data at rest.
- If you only need the SSIDs, use the profile-name-only script rather than exporting keys.

## Conclusion

The built-in `netsh wlan` commands are enough to list saved Wi-Fi profiles and inspect a profile's details. PowerShell makes it possible to format those results, process multiple profiles, and export structured data. By saving the script and its batch launcher in the same folder, you can repeat the export with a double-click instead of retyping commands each time.

Remember that convenience comes with responsibility: saved passwords and exported credentials should remain private and be handled like any other sensitive account information.

## References

- [Microsoft Learn: `netsh wlan` commands](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/netsh-wlan)
- [Microsoft Learn: `netsh` command reference](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/netsh)
- [Microsoft Learn: `Export-Csv`](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/export-csv)
- [Microsoft Learn: `Select-String`](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/select-string)
