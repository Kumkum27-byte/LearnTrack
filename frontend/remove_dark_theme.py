import re

with open('style.css', 'r') as f:
    content = f.read()

# Remove all [data-theme="dark"] CSS blocks using a more thorough regex
# This matches the selector and everything up to the closing brace
pattern = r'\n\s*\[data-theme="dark"\][^{]*\{(?:[^{}]|{[^}]*})*\}'
content = re.sub(pattern, '', content, flags=re.MULTILINE)

with open('style.css', 'w') as f:
    f.write(content)

# Verify
remaining = len(re.findall(r'\[data-theme="dark"\]', content))
print(f'✅ Dark theme CSS removed - {remaining} selectors still present' if remaining > 0 else '✅ All dark theme CSS removed successfully')
