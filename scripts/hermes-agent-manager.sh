#!/bin/bash
input=$(cat)
# Appel du CLI de l'Agent Hermès (Nous Research) avec le prompt en stdin/argument
/Users/hayssamhoballah/.local/bin/hermes -z "$input"
