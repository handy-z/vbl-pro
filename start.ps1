bun run compile
Copy-Item -Path "release\vbl-pro.exe" -Destination ".\vbl-pro.exe" -Force
Write-Host "Output: vbl-pro.exe"
./vbl-pro.exe
