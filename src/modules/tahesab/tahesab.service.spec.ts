import { HttpModule, HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { TahesabHttpClient } from './tahesab-http.client';
import { TahesabService } from './tahesab.service';
import { DoListAsnadRequestDto } from './dto/list-documents.dto';
import { GetMandeHesabByCodeRequestDto } from './dto/customer-balance.dto';
import { ConfigService } from '@nestjs/config';

describe('TahesabService', () => {
  let service: TahesabService;
  let httpService: HttpService;
  let configGetMock: jest.Mock;

  beforeEach(async () => {
    configGetMock = jest.fn((key: string) => {
      if (key === 'TAHESAB_AUTH_TOKEN') {
        return 'token';
      }
      if (key === 'TAHESAB_DB_NAME') {
        return 'DB1';
      }
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule],
      providers: [
        TahesabService,
        TahesabHttpClient,
        {
          provide: ConfigService,
          useValue: { get: configGetMock },
        },
      ],
    }).compile();

    service = module.get<TahesabService>(TahesabService);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('wraps method call in envelope', async () => {
    const response = { ok: true };
    jest.spyOn(httpService, 'post').mockReturnValue(of({ data: response } as any));

    const result = await service.callMethod('Ping', []);

    expect(httpService.post).toHaveBeenCalledWith('/', { Ping: [] }, expect.any(Object));
    expect(result).toEqual(response);
  });

  it('maps listDocuments dto into ordered array payload', async () => {
    const dto: DoListAsnadRequestDto = {
      countLast: 10,
      customerCode: 'C1',
      fromDateShamsi: '1403/01/01',
      toDateShamsi: '1403/01/30',
      filterNoSanad: '123',
      metalType: 'GOLD',
    };
    const spy = jest
      .spyOn(service as any, 'callMethod')
      .mockResolvedValue({} as any);

    await service.listDocuments(dto);

    expect(spy).toHaveBeenCalledWith('DoListAsnad', [
      dto.countLast,
      dto.customerCode,
      dto.fromDateShamsi,
      dto.toDateShamsi,
      dto.filterNoSanad,
      dto.metalType,
    ]);
  });

  it('maps getBalanceByCustomerCode to expected method name and payload', async () => {
    const dto: GetMandeHesabByCodeRequestDto = { customerCode: 'CUST-1' };
    const spy = jest
      .spyOn(service as any, 'callMethod')
      .mockResolvedValue({ balance: 0 });

    await service.getBalanceByCustomerCode(dto);

    expect(spy).toHaveBeenCalledWith('getmandehesabbycode', [dto.customerCode]);
  });
});
