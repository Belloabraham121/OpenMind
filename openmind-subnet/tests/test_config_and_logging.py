import logging
import os

from utils.config import load_config, OpenMindConfig
from utils.logging import setup_logging


def test_load_config_defaults_and_env(monkeypatch):
    # Defaults
    cfg = load_config()
    assert isinstance(cfg, OpenMindConfig)
    assert cfg.log_level == "INFO"
    assert cfg.storage_dir == ".openmind_storage"

    # Override via env
    monkeypatch.setenv("OPENMIND_LOG_LEVEL", "DEBUG")
    monkeypatch.setenv("OPENMIND_STORAGE_DIR", "/tmp/openmind")
    monkeypatch.setenv("OPENMIND_METRICS_SAMPLE_INTERVAL_SEC", "30")

    cfg2 = load_config()
    assert cfg2.log_level == "DEBUG"
    assert cfg2.storage_dir == "/tmp/openmind"
    assert cfg2.metrics_sample_interval_sec == 30


def test_setup_logging_sets_root_level(monkeypatch):
    monkeypatch.setenv("OPENMIND_LOG_LEVEL", "WARNING")
    setup_logging()

    root = logging.getLogger()
    assert root.level == logging.WARNING

