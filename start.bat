@echo off
chcp 65001 > nul
title Hệ thống Xác minh Mã số thuế - Mạng nội bộ

echo ====================================================================
echo          HỆ THỐNG XÁC MINH MÃ SỐ THUẾ (MASOTHUE.COM)
echo ====================================================================
echo.
echo  Đang khởi động máy chủ phục vụ mạng nội bộ...
echo.

node backend/server.js

pause
