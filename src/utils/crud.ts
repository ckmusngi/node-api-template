import type {
  Attributes,
  CreationAttributes,
  FindOptions,
  Includeable,
  Model,
  ModelStatic,
  Order,
  Transaction,
  WhereOptions,
} from 'sequelize';
import { AppError } from './app-error';
import { buildPaginationMeta, toOffset, type PaginationInput } from './pagination';
import { buildFilters, buildSearch, combineWhere, parseSort, type FilterDefinition } from './query';

export interface ListParams extends PaginationInput {
  sort?: string;
  search?: string;
  [filter: string]: unknown;
}

export interface CrudConfig<M extends Model> {
  model: ModelStatic<M>;
  /** Human-readable name used in error messages. */
  name: string;
  sortable: readonly string[];
  searchable?: readonly string[];
  filters?: Record<string, FilterDefinition>;
  defaultOrder?: Order;
  include?: Includeable[];
}

/**
 * Generic repository with list (paginate/filter/sort/search), get, create, update,
 * soft delete and restore. `scope` lets callers restrict every query, e.g. to the
 * current owner or tenant, so resource-level authorization cannot be forgotten.
 */
export function createCrudRepository<M extends Model>(config: CrudConfig<M>) {
  const { model, name, sortable, searchable = [], filters = {}, defaultOrder, include } = config;

  return {
    async list(
      params: ListParams,
      scope: WhereOptions = {},
      options: Pick<FindOptions, 'paranoid' | 'attributes'> = {},
    ) {
      const where = combineWhere(scope, buildFilters(params, filters), buildSearch(params.search, searchable));
      const { rows, count } = await model.findAndCountAll({
        where,
        order: parseSort(params.sort, sortable, defaultOrder),
        include,
        distinct: true,
        ...toOffset(params),
        ...options,
      });
      return { rows, meta: buildPaginationMeta(count, params) };
    },

    async findById(
      id: string | number,
      scope: WhereOptions = {},
      options: { paranoid?: boolean; transaction?: Transaction } = {},
    ) {
      const row = await model.findOne({
        where: combineWhere({ id }, scope),
        include,
        ...options,
      });
      if (!row) throw AppError.notFound(name);
      return row;
    },

    create(values: CreationAttributes<M>, transaction?: Transaction) {
      return model.create(values, { transaction });
    },

    update(instance: M, values: Partial<Attributes<M>>, transaction?: Transaction) {
      return instance.update(values, { transaction });
    },

    /** Soft deletes paranoid models; pass force to hard delete. */
    async remove(instance: M, { force = false, transaction }: { force?: boolean; transaction?: Transaction } = {}) {
      await instance.destroy({ force, transaction });
    },

    async restore(id: string | number, scope: WhereOptions = {}) {
      const row = await model.findOne({
        where: combineWhere({ id }, scope),
        paranoid: false,
      });
      if (!row) throw AppError.notFound(name);
      await row.restore();
      return row;
    },
  };
}
