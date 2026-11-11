# Compose unchanged emblem and separately designed wordmark. Run from repository root.
Add-Type -AssemblyName System.Drawing
$brandDir = Join-Path (Get-Location) 'iphone/public/brand'
$emblem=[System.Drawing.Image]::FromFile((Join-Path $brandDir 'nisfayn-emblem.png'))
$word=[System.Drawing.Image]::FromFile((Join-Path $brandDir 'wudayn-wordmark-v3.png'))
$canvas=New-Object System.Drawing.Bitmap(768,900)
$g=[System.Drawing.Graphics]::FromImage($canvas)
$g.InterpolationMode='HighQualityBicubic';$g.TextRenderingHint='AntiAliasGridFit'
$g.DrawImage($emblem,[System.Drawing.Rectangle]::new(104,0,560,560))
$g.DrawImage($word,[System.Drawing.Rectangle]::new(34,570,700,253))
$font=New-Object System.Drawing.Font('Segoe UI',28,[System.Drawing.FontStyle]::Regular,[System.Drawing.GraphicsUnit]::Pixel)
$brush=New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#5A0F28'))
$format=New-Object System.Drawing.StringFormat;$format.Alignment='Center'
$g.DrawString('W U D A Y N   A I',$font,$brush,[System.Drawing.RectangleF]::new(0,835,768,50),$format)
$canvas.Save((Join-Path $brandDir 'wudayn-lockup-v3.png'))
$g.Dispose();$canvas.Dispose();$emblem.Dispose();$word.Dispose()
Copy-Item (Join-Path $brandDir 'wudayn-lockup-v3.png') iphone/ios/App/App/Assets.xcassets/NisfaynLockup.imageset/lockup.png
