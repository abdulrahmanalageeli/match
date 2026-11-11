Add-Type -AssemblyName System.Drawing
$brandDir = Join-Path (Get-Location) 'iphone/public/brand'
function Canvas($w,$h) { $b=New-Object System.Drawing.Bitmap($w,$h); $g=[System.Drawing.Graphics]::FromImage($b); $g.SmoothingMode='AntiAlias'; $g.TextRenderingHint='AntiAliasGridFit'; return @($b,$g) }
function Mark($g,$x,$y,$size) {
 $state=$g.Save(); $g.TranslateTransform($x,$y); $g.ScaleTransform($size/768,$size/768)
 $a=New-Object System.Drawing.Drawing2D.GraphicsPath
 $a.AddBezier(384,626,320,543,137,425,137,277); $a.AddBezier(137,277,137,128,321,119,384,273)
 $b=New-Object System.Drawing.Drawing2D.GraphicsPath
 $b.AddBezier(384,626,448,543,631,425,631,277); $b.AddBezier(631,277,631,128,447,119,384,273)
 foreach($item in @(@($a,'#5A0F28'),@($b,'#C5838F'))) { $pen=New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml($item[1]),55);$pen.StartCap='Round';$pen.EndCap='Round';$g.DrawPath($pen,$item[0]);$pen.Dispose() }
 $g.Restore($state)
}
function Word($g,$w,$y,$h) {
 $fmt=New-Object System.Drawing.StringFormat;$fmt.Alignment='Center';$fmt.LineAlignment='Center';$fmt.FormatFlags=[System.Drawing.StringFormatFlags]::DirectionRightToLeft
 $font=New-Object System.Drawing.Font('Segoe UI',($h*0.60),[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel)
 $brush=New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#5A0F28'))
 $g.DrawString('وُدَين',$font,$brush,[System.Drawing.RectangleF]::new(0,$y,$w,$h),$fmt)
}
$c=Canvas 768 768; Mark $c[1] 0 0 768; foreach($name in @('heart','emblem')) {$c[0].Save((Join-Path $brandDir "wudayn-$name.png"))};$c[1].Dispose();$c[0].Dispose()
$c=Canvas 512 154;Word $c[1] 512 -12 166;$c[0].Save((Join-Path $brandDir 'wudayn-wordmark.png'));$c[1].Dispose();$c[0].Dispose()
$c=Canvas 768 900;Mark $c[1] 64 0 640;Word $c[1] 768 590 210
$f=New-Object System.Drawing.Font('Segoe UI',34,[System.Drawing.FontStyle]::Regular,[System.Drawing.GraphicsUnit]::Pixel);$fmt=New-Object System.Drawing.StringFormat;$fmt.Alignment='Center';$c[1].DrawString('W U D A Y N   A I',$f,[System.Drawing.Brushes]::Black,[System.Drawing.RectangleF]::new(0,812,768,60),$fmt)
$c[0].Save((Join-Path $brandDir 'wudayn-lockup.png'));$c[1].Dispose();$c[0].Dispose()
$c=Canvas 1024 1024;$c[1].Clear([System.Drawing.ColorTranslator]::FromHtml('#FDFBF9'));Mark $c[1] 72 72 880;$c[0].Save((Join-Path $brandDir 'wudayn-icon.png'));$c[1].Dispose();$c[0].Dispose()
Copy-Item -LiteralPath (Join-Path $brandDir 'wudayn-icon.png') -Destination iphone/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
Copy-Item -LiteralPath (Join-Path $brandDir 'wudayn-lockup.png') -Destination iphone/ios/App/App/Assets.xcassets/NisfaynLockup.imageset/lockup.png
