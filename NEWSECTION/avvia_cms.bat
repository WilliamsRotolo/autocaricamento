@echo off
cd /d "%~dp0"
echo.
echo  ============================================
echo   CMS Rotolo Automobili - avvio in corso...
echo  ============================================
echo.
echo  Apri il browser su: http://localhost:8501
echo  Per chiudere: premi CTRL+C in questa finestra
echo.
streamlit run app.py --server.headless false
pause
