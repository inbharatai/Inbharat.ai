import subprocess, os

tmp = os.path.join(os.environ['TEMP'], 'silt-body.tmp').replace('\\', '/')
paths = ['/', '/sitemap.xml', '/robots.txt', '/README.md', '/studio/', '/studio', '/logo.svg', '/web/studio-bridge.js', '/PATENT.md']
print('path\tbytes\tcontent_type\thead')
for p in paths:
    try:
        subprocess.run(['curl', '-sS', '-o', tmp, '-H', 'Accept-Encoding: identity', 'https://silt.inbharat.ai' + p], check=True)
    except Exception as e:
        print(f'{p}\tcurl error: {e}')
        continue
    with open(tmp, 'rb') as f:
        body = f.read()
    ct = subprocess.check_output(['curl', '-sSI', '-H', 'Accept-Encoding: identity', 'https://silt.inbharat.ai' + p], text=True, errors='replace')
    content_type = ''
    for line in ct.splitlines():
        if line.lower().startswith('content-type:'):
            content_type = line.split(':',1)[1].strip()
    head = body[:200]
    print(f'{p}\t{len(body)}\t{content_type}\t{head!r}')
