; S-Recorder Installer - Professional Setup

; Welcome Page
!define MUI_WELCOMEPAGE_TITLE "Welcome to S-Recorder Setup"
!define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of S-Recorder - Professional Screen Recorder.$\r$\n$\r$\nClick Next to continue."

; Finish Page
!define MUI_FINISHPAGE_TITLE "Installation Complete"
!define MUI_FINISHPAGE_TEXT "S-Recorder has been installed on your computer.$\r$\n$\r$\nClick Finish to close Setup."
!define MUI_FINISHPAGE_RUN "$INSTDIR\S-Recorder.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch S-Recorder"

; ⭐ FORCE SHOW DETAILS
ShowInstDetails show
ShowUninstDetails show

; ⭐ Override electron-builder's hidden setting
!define MUI_INSTFILESPAGE ""