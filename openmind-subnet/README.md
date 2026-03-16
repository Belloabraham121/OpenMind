OpenMind Subnet
================

This repository implements the OpenMind Bittensor subnet, a decentralized memory OS for MCP-compatible AI agents.

## Project Structure

The recommended layout is:

```text
openmind-subnet/
├── neurons/
│   ├── miner.py
│   └── validator.py
├── openmind/
│   ├── __init__.py
│   ├── protocol.py
│   ├── storage.py
│   ├── retrieval.py
│   ├── durability.py
│   ├── versioning.py
│   ├── shared_space.py
│   ├── multimodal.py
│   ├── checkpoint.py
│   └── scoring.py
├── utils/
│   ├── config.py
│   ├── logging.py
│   └── crypto.py
├── tests/
├── requirements.txt
└── neuron.py
```

At this stage, the repository only contains scaffolding for this structure. Core logic will be implemented in subsequent iterations.

