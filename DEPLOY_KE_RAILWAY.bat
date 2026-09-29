@echo off
title Deploy Solvient Growth ke GitHub & Railway
color 0b
echo ========================================================
echo   SOLVIENT GROWTH - PUSH KE GITHUB & AUTO-DEPLOY RAILWAY
echo ========================================================
echo.
cd /d "%~dp0"

echo [1/3] Menyiapkan file-file perubahan (package.json, server.js, schema.sql, admin.html)...
git add .

echo [2/3] Membuat commit git...
git commit -m "Full update: Customer & Admin separation with PostgreSQL server on Railway"

echo [3/3] Mengirim (push) ke GitHub repository Belajar-web...
git push origin main

echo.
echo ========================================================
echo   SELESAI! File sudah berhasil di-push ke GitHub!
echo   Buka kembali tab Railway di Chrome Anda:
echo   Railway akan otomatis mendeteksi commit baru dan
echo   mengubah status 'Build failed' menjadi 'Active'.
echo ========================================================
echo.
pause
