# SPDX-License-Identifier: AGPL-3.0-or-later
"""Connection profiles (audit gap 8), as SillyTavern's: a named model and preset a chat switches to in
one step. The model carries its API, address, key and instruct template; the preset its samplers and
prompt layout. /v1/connection_profile, the person's own. The lite twin is
client/src/lib/connectionProfileRecords.ts.
"""

from typing import Any, ClassVar

from fastapi import HTTPException
from pydantic import Field
from zephyrex.extensions.ai_character.BLL_AI_Character import not_yours  # type: ignore[import-not-found]
from zephyrex.extensions.ai_character.Contract import CONTRACT, LIMITS  # type: ignore[import-not-found]
from zephyrex.extensions.ai_chat.BLL_AI_Chat import (  # type: ignore[import-not-found]
    GenerationPresetManager,
    ModelEndpointManager,
)
from zephyrex.logic.AbstractLogicManager import (
    AbstractBLLManager,
    ApplicationModel,
    ModelMeta,
    StringSearchModel,
    UpdateMixinModel,
)
from zephyrex.pydantic2.fastapi import RouterMixin

# The framework's registry BaseModel, which it re-exports without declaring it.
from zephyrex.pydantic2.registry import BaseModel  # type: ignore[attr-defined]

MAX_NAME: int = LIMITS["name_characters"]


class ConnectionProfileModel(ApplicationModel, UpdateMixinModel, metaclass=ModelMeta):
    Manager: ClassVar[type["ConnectionProfileManager"]]
    name: str = Field(..., description="The profile's name")
    endpoint_id: str | None = Field(None, description="The model it switches to (null: the default)")
    preset_id: str | None = Field(None, description="The preset it switches to (null: the defaults)")

    table_comment: ClassVar[str] = "Zephyrex RPG AI connection profiles"

    class Create(BaseModel):
        name: str = Field(..., min_length=1, max_length=MAX_NAME)
        endpoint_id: str | None = Field(None, min_length=1)
        preset_id: str | None = Field(None, min_length=1)

    class Update(BaseModel):
        name: str | None = Field(None, min_length=1, max_length=MAX_NAME)
        endpoint_id: str | None = Field(None, min_length=1)
        preset_id: str | None = Field(None, min_length=1)

    class Search(ApplicationModel.Search):
        name: StringSearchModel | None = None


class ConnectionProfileManager(AbstractBLLManager[ConnectionProfileModel], RouterMixin):
    _model = ConnectionProfileModel

    def _owned(self, manager: type[Any], id: str, field: str) -> Any:
        try:
            return manager(requester_id=str(self.requester.id), model_registry=self.model_registry).get(id=id)
        except HTTPException as error:
            raise not_yours(field) from error

    def _check_references(self, fields: dict[str, Any]) -> None:
        """A profile names only the person's own model (never a search source) and preset."""
        if fields.get("endpoint_id") is not None:
            endpoint = self._owned(ModelEndpointManager, fields["endpoint_id"], "endpoint_id")
            if endpoint.api in CONTRACT["search_apis"]:
                raise not_yours("endpoint_id")
        if fields.get("preset_id") is not None:
            self._owned(GenerationPresetManager, fields["preset_id"], "preset_id")

    def create(self, **kwargs: Any) -> Any:
        self._check_references(kwargs)
        return super().create(**kwargs)

    def update(self, id: str, **kwargs: Any) -> Any:
        self._check_references(kwargs)
        return super().update(id, **kwargs)
