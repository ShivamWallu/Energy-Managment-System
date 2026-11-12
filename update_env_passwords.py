import os

env_path = ".env"
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    new_lines = []
    found_primary = False
    found_secondary = False

    for line in lines:
        if line.strip().startswith("PRIMARY_SMTP_PASSWORD"):
            new_lines.append('PRIMARY_SMTP_PASSWORD="eywx ymyd xntx mtrt"\n')
            found_primary = True
        elif line.strip().startswith("SECONDARY_SMTP_PASSWORD"):
            new_lines.append('SECONDARY_SMTP_PASSWORD="piqv wcut yvxj mibn"\n')
            found_secondary = True
        elif line.strip().startswith("PRIMARY_SMTP_USER"):
            new_lines.append('PRIMARY_SMTP_USER=noreplykogm@gmail.com\n')
        elif line.strip().startswith("SECONDARY_SMTP_USER"):
            new_lines.append('SECONDARY_SMTP_USER=chd.kogm@gmail.com\n')
        else:
            new_lines.append(line)

    if not found_primary:
        new_lines.append('PRIMARY_SMTP_PASSWORD="eywx ymyd xntx mtrt"\n')
    if not found_secondary:
        new_lines.append('SECONDARY_SMTP_PASSWORD="piqv wcut yvxj mibn"\n')

    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)
    print("✅ .env file successfully updated with working App Passwords!")
else:
    with open(env_path, "w", encoding="utf-8") as f:
        f.write('PRIMARY_SMTP_USER=noreplykogm@gmail.com\n')
        f.write('PRIMARY_SMTP_PASSWORD="eywx ymyd xntx mtrt"\n')
        f.write('SECONDARY_SMTP_USER=chd.kogm@gmail.com\n')
        f.write('SECONDARY_SMTP_PASSWORD="piqv wcut yvxj mibn"\n')
        f.write('SMTP_HOST=smtp.gmail.com\n')
        f.write('SMTP_PORT=587\n')
    print("✅ New .env file created with working App Passwords!")
