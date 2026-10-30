#!/usr/bin/env node
import { run } from '../src/cli.js';

process.stdout.write(run(process.argv.slice(2)) + '\n');
